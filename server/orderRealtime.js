import { randomUUID } from 'node:crypto';
import { TOKEN_TYPES, verifyToken } from './tokenPolicy.js';

export const REALTIME_PROTOCOL_VERSION = 1;
export const SOCKET_AUTHORIZATION_FAILED = 'SOCKET_AUTHORIZATION_FAILED';

const positiveInteger = value => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const isoTimestamp = value => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

export const adminRealtimeRoom = ({ organizationId, adminId }) =>
  `organization:${organizationId}:admin:${adminId}`;

export const orderRealtimeRoom = ({ organizationId, orderId }) =>
  `organization:${organizationId}:order:${orderId}`;

export const createOrderEventEnvelope = (order, { orderRepresentation, eventId, occurredAt } = {}) => {
  const id = positiveInteger(order?.id);
  const version = positiveInteger(order?.version);
  if (!id || !version || typeof order?.status !== 'string' || !order?.updated_at) {
    throw new Error('A persisted order id, status, version, and updated_at are required');
  }

  return {
    protocolVersion: REALTIME_PROTOCOL_VERSION,
    eventId: eventId || randomUUID(),
    occurredAt: isoTimestamp(occurredAt || new Date()),
    order: {
      id,
      status: order.status,
      version,
      updated_at: isoTimestamp(order.updated_at),
    },
    ...(orderRepresentation ? { orderRepresentation } : {}),
  };
};

export class OrderTrackingAuthorizationError extends Error {
  constructor(reason) {
    super('Order tracking authorization failed');
    this.name = 'OrderTrackingAuthorizationError';
    this.reason = reason;
  }
}

export const createOrderRealtimeService = ({
  db,
  tokenSecret,
  resolveTenantClaims,
}) => {
  if (!db) throw new Error('Realtime database is required');
  if (!tokenSecret) throw new Error('Realtime token secret is required');
  if (typeof resolveTenantClaims !== 'function') {
    throw new Error('Realtime tenant claim resolver is required');
  }

  const authorizeAdmin = async payload => {
    const token = typeof payload?.token === 'string' ? payload.token : '';
    if (!token) throw new OrderTrackingAuthorizationError('INVALID_CREDENTIAL');

    let claims;
    try {
      claims = verifyToken(TOKEN_TYPES.RESTAURANT_SESSION, token, tokenSecret);
    } catch {
      throw new OrderTrackingAuthorizationError('INVALID_CREDENTIAL');
    }
    if (claims.role !== 'RESTAURANT_ADMIN') {
      throw new OrderTrackingAuthorizationError('INVALID_CREDENTIAL');
    }

    const session = await resolveTenantClaims(claims);
    if (!session?.organization?.id || !session?.admin?.id) {
      throw new OrderTrackingAuthorizationError('NOT_FOUND');
    }

    return {
      organizationId: session.organization.id,
      adminId: session.admin.id,
      room: adminRealtimeRoom({
        organizationId: session.organization.id,
        adminId: session.admin.id,
      }),
      legacyRoom: `admin_${session.admin.id}`,
    };
  };

  const resolveTrackingOrder = async ({ orderId: requestedOrderId, trackingToken }) => {
    const orderId = positiveInteger(requestedOrderId);
    if (!orderId || typeof trackingToken !== 'string' || !trackingToken) {
      throw new OrderTrackingAuthorizationError('INVALID_INPUT');
    }

    let claims;
    try {
      claims = verifyToken(TOKEN_TYPES.ORDER_TRACKING, trackingToken, tokenSecret);
    } catch {
      throw new OrderTrackingAuthorizationError('INVALID_CREDENTIAL');
    }

    if (
      positiveInteger(claims.orderId) !== orderId
      || typeof claims.organizationId !== 'string'
      || typeof claims.adminId !== 'string'
    ) {
      throw new OrderTrackingAuthorizationError('NOT_FOUND');
    }

    const order = await db.order.findFirst({
      where: {
        id: orderId,
        organization_id: claims.organizationId,
        admin_id: claims.adminId,
      },
      select: {
        id: true,
        organization_id: true,
        admin_id: true,
        status: true,
        version: true,
        updated_at: true,
      },
    });
    if (!order) throw new OrderTrackingAuthorizationError('NOT_FOUND');
    return order;
  };

  const authorizeOrder = async payload => {
    const order = await resolveTrackingOrder({
      orderId: payload?.orderId,
      trackingToken: payload?.trackingToken,
    });
    return {
      order,
      room: orderRealtimeRoom({ organizationId: order.organization_id, orderId: order.id }),
      legacyRoom: `order_${order.id}`,
    };
  };

  const register = io => {
    io.on('connection', socket => {
      socket.on('join-admin', async (payload, acknowledge) => {
        try {
          const authorization = await authorizeAdmin(payload);
          await socket.join([authorization.room, authorization.legacyRoom]);
          if (typeof acknowledge === 'function') {
            acknowledge({ ok: true, protocolVersion: REALTIME_PROTOCOL_VERSION });
          }
        } catch {
          if (typeof acknowledge === 'function') {
            acknowledge({
              ok: false,
              protocolVersion: REALTIME_PROTOCOL_VERSION,
              code: SOCKET_AUTHORIZATION_FAILED,
            });
          }
        }
      });

      socket.on('join-order', async (payload, acknowledge) => {
        try {
          const authorization = await authorizeOrder(payload);
          await socket.join([authorization.room, authorization.legacyRoom]);
          if (typeof acknowledge === 'function') {
            acknowledge({ ok: true, protocolVersion: REALTIME_PROTOCOL_VERSION });
          }
        } catch {
          if (typeof acknowledge === 'function') {
            acknowledge({
              ok: false,
              protocolVersion: REALTIME_PROTOCOL_VERSION,
              code: SOCKET_AUTHORIZATION_FAILED,
            });
          }
        }
      });
    });
  };

  const emitCreated = (io, order, orderRepresentation) => {
    const envelope = createOrderEventEnvelope(order, { orderRepresentation });
    io.to(adminRealtimeRoom({
      organizationId: order.organization_id,
      adminId: order.admin_id,
    })).emit('order.created.v1', envelope);
    io.to(`admin_${order.admin_id}`).emit('new-order', orderRepresentation);
    return envelope;
  };

  const emitStatus = (io, order) => {
    const envelope = createOrderEventEnvelope(order);
    io.to(adminRealtimeRoom({
      organizationId: order.organization_id,
      adminId: order.admin_id,
    })).to(orderRealtimeRoom({
      organizationId: order.organization_id,
      orderId: order.id,
    })).emit('order.status.v1', envelope);
    io.to(`order_${order.id}`).emit('order-status-updated', { status: order.status });
    io.to(`admin_${order.admin_id}`).emit('order-updated', order);
    return envelope;
  };

  return {
    authorizeAdmin,
    authorizeOrder,
    resolveTrackingOrder,
    register,
    emitCreated,
    emitStatus,
  };
};
