import { randomUUID } from 'node:crypto';
import { TOKEN_TYPES, issueToken, verifyToken } from './tokenPolicy.js';

export const REALTIME_PROTOCOL_VERSION = 1;
export const SOCKET_AUTHORIZATION_FAILED = 'SOCKET_AUTHORIZATION_FAILED';
export const ORDER_TRACKING_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

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

  const trackingTokenStore = db.orderTrackingToken;
  const activeSockets = new Map();

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
      userId: session.user?.id,
      room: adminRealtimeRoom({
        organizationId: session.organization.id,
        adminId: session.admin.id,
      }),
      legacyRoom: `admin_${session.admin.id}`,
    };
  };

  const getOrCreateTrackingToken = async order => {
    if (!trackingTokenStore) {
      return issueToken(TOKEN_TYPES.ORDER_TRACKING, {
        orderId: order.id,
        organizationId: order.organization_id,
        adminId: order.admin_id,
      }, tokenSecret, { subject: String(order.id) });
    }

    const existing = await trackingTokenStore.findUnique({ where: { order_id: order.id } });
    if (existing && !existing.revoked_at && existing.expires_at > new Date()) {
      return issueToken(TOKEN_TYPES.ORDER_TRACKING, {
        orderId: order.id,
        organizationId: order.organization_id,
        adminId: order.admin_id,
        jti: existing.jti,
      }, tokenSecret, { subject: String(order.id) });
    }

    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + ORDER_TRACKING_TOKEN_TTL_MS);
    try {
      await trackingTokenStore.upsert({
        where: { order_id: order.id },
        create: {
          order_id: order.id,
          organization_id: order.organization_id,
          admin_id: order.admin_id,
          jti,
          expires_at: expiresAt,
        },
        update: {
          jti,
          expires_at: expiresAt,
          revoked_at: null,
          organization_id: order.organization_id,
          admin_id: order.admin_id,
        },
      });
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
      const concurrent = await trackingTokenStore.findUnique({ where: { order_id: order.id } });
      if (!concurrent) throw error;
      return issueToken(TOKEN_TYPES.ORDER_TRACKING, {
        orderId: order.id,
        organizationId: order.organization_id,
        adminId: order.admin_id,
        jti: concurrent.jti,
      }, tokenSecret, { subject: String(order.id) });
    }

    return issueToken(TOKEN_TYPES.ORDER_TRACKING, {
      orderId: order.id,
      organizationId: order.organization_id,
      adminId: order.admin_id,
      jti,
    }, tokenSecret, { subject: String(order.id) });
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
      || typeof claims.jti !== 'string'
    ) {
      throw new OrderTrackingAuthorizationError('NOT_FOUND');
    }

    if (trackingTokenStore) {
      const tokenRecord = await trackingTokenStore.findFirst({
        where: {
          order_id: orderId,
          organization_id: claims.organizationId,
          admin_id: claims.adminId,
          jti: claims.jti,
          revoked_at: null,
          expires_at: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!tokenRecord) throw new OrderTrackingAuthorizationError('INVALID_CREDENTIAL');
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
      const socketKey = socket.id || socket;
      activeSockets.set(socketKey, socket);
      socket.on('disconnect', () => activeSockets.delete(socketKey));
      socket.on('join-admin', async (payload, acknowledge) => {
        try {
          const authorization = await authorizeAdmin(payload);
          socket.data = socket.data || {};
          socket.data.adminAuthorization = authorization;
          activeSockets.set(socketKey, socket);
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

  const revokeMembership = ({ organizationId, userId }) => {
    for (const [socketKey, socket] of activeSockets) {
      const authorization = socket.data?.adminAuthorization;
      if (authorization?.organizationId !== organizationId || authorization.userId !== userId) continue;
      activeSockets.delete(socketKey);
      socket.disconnect?.(true);
    }
  };

  const revokeTrackingToken = async ({ jti, organizationId } = {}) => {
    if (!trackingTokenStore || typeof jti !== 'string') return 0;
    const result = await trackingTokenStore.updateMany({
      where: { jti, ...(organizationId ? { organization_id: organizationId } : {}) },
      data: { revoked_at: new Date() },
    });
    return result.count;
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
    getOrCreateTrackingToken,
    revokeMembership,
    revokeTrackingToken,
    register,
    emitCreated,
    emitStatus,
  };
};
