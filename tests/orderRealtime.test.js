import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OrderTrackingAuthorizationError,
  REALTIME_PROTOCOL_VERSION,
  SOCKET_AUTHORIZATION_FAILED,
  adminRealtimeRoom,
  createOrderEventEnvelope,
  createOrderRealtimeService,
  orderRealtimeRoom,
} from '../server/orderRealtime.js';
import { TOKEN_TYPES, issueToken } from '../server/tokenPolicy.js';

const secret = 'order-realtime-unit-test-secret';
const organizationId = '10000000-0000-4000-8000-000000000001';
const adminId = '20000000-0000-4000-8000-000000000001';

const restaurantSession = issueToken(TOKEN_TYPES.RESTAURANT_SESSION, {
  id: adminId,
  userId: '30000000-0000-4000-8000-000000000001',
  organizationId,
  role: 'RESTAURANT_ADMIN',
}, secret);

const trackingToken = issueToken(TOKEN_TYPES.ORDER_TRACKING, {
  orderId: 41,
  organizationId,
  adminId,
}, secret, { subject: '41' });

const persistedOrder = {
  id: 41,
  organization_id: organizationId,
  admin_id: adminId,
  status: 'preparing',
  version: 2,
  updated_at: new Date('2026-08-15T10:00:00.000Z'),
  admin: {
    subscription_status: 'ACTIVE',
    subscription_end: null,
    trial_ends_at: null,
  },
};

const createService = ({ findFirst, resolveTenantClaims } = {}) => createOrderRealtimeService({
  db: {
    order: {
      findFirst: findFirst || (async query => {
        assert.deepEqual(query.where, {
          id: 41,
          organization_id: organizationId,
          admin_id: adminId,
        });
        return persistedOrder;
      }),
    },
  },
  tokenSecret: secret,
  resolveTenantClaims: resolveTenantClaims || (async () => ({
    organization: { id: organizationId },
    admin: { id: adminId },
  })),
});

test('realtime room names include tenant scope and contain no credential material', () => {
  assert.equal(
    adminRealtimeRoom({ organizationId, adminId }),
    `organization:${organizationId}:admin:${adminId}`,
  );
  assert.equal(
    orderRealtimeRoom({ organizationId, orderId: 41 }),
    `organization:${organizationId}:order:41`,
  );
  assert.equal(orderRealtimeRoom({ organizationId, orderId: 41 }).includes(trackingToken), false);
});

test('admin room authority is derived from the active token session, not a claimed admin id', async () => {
  const authorization = await createService().authorizeAdmin({
    token: restaurantSession,
    adminId: 'attacker-controlled-room',
  });

  assert.equal(authorization.organizationId, organizationId);
  assert.equal(authorization.adminId, adminId);
  assert.equal(authorization.room, `organization:${organizationId}:admin:${adminId}`);
});

test('admin room rejects the tracking token class and inactive tenant sessions', async () => {
  await assert.rejects(
    createService().authorizeAdmin({ token: trackingToken }),
    error => error instanceof OrderTrackingAuthorizationError,
  );
  await assert.rejects(
    createService({ resolveTenantClaims: async () => null }).authorizeAdmin({ token: restaurantSession }),
    error => error instanceof OrderTrackingAuthorizationError,
  );
});

test('tracking authorization verifies token scope and revalidates the order in the database', async () => {
  const service = createService();
  const authorization = await service.authorizeOrder({ orderId: 41, trackingToken });

  assert.equal(authorization.order.id, 41);
  assert.equal(authorization.room, `organization:${organizationId}:order:41`);
  await assert.rejects(
    service.authorizeOrder({ orderId: 42, trackingToken }),
    error => error instanceof OrderTrackingAuthorizationError && error.reason === 'NOT_FOUND',
  );
});

test('tracking authorization fails closed when the persisted order no longer matches', async () => {
  const service = createService({ findFirst: async () => null });
  await assert.rejects(
    service.authorizeOrder({ orderId: 41, trackingToken }),
    error => error instanceof OrderTrackingAuthorizationError && error.reason === 'NOT_FOUND',
  );
});

test('tracking authorization fails closed when the restaurant subscription is inactive', async () => {
  const service = createService({
    findFirst: async () => ({
      ...persistedOrder,
      admin: { subscription_status: 'CANCELLED', subscription_end: null, trial_ends_at: null },
    }),
  });
  await assert.rejects(
    service.authorizeOrder({ orderId: 41, trackingToken }),
    error => error instanceof OrderTrackingAuthorizationError && error.reason === 'NOT_FOUND',
  );
});

test('socket joins return a generic acknowledgement and join only authorized rooms', async () => {
  const connectionHandlers = {};
  const socketHandlers = {};
  const joined = [];
  const io = {
    on(event, handler) { connectionHandlers[event] = handler; },
  };
  const socket = {
    on(event, handler) { socketHandlers[event] = handler; },
    async join(room) { joined.push(room); },
  };
  const service = createService();
  service.register(io);
  connectionHandlers.connection(socket);

  let accepted;
  await socketHandlers['join-order'](
    { orderId: 41, trackingToken },
    result => { accepted = result; },
  );
  assert.deepEqual(accepted, { ok: true, protocolVersion: REALTIME_PROTOCOL_VERSION });
  assert.deepEqual(joined, [`organization:${organizationId}:order:41`]);
  assert.equal(socketHandlers['join-menu'], undefined);

  let rejected;
  await socketHandlers['join-order'](
    { orderId: 42, trackingToken },
    result => { rejected = result; },
  );
  assert.deepEqual(rejected, {
    ok: false,
    protocolVersion: REALTIME_PROTOCOL_VERSION,
    code: SOCKET_AUTHORIZATION_FAILED,
  });
  assert.equal(Object.hasOwn(rejected, 'reason'), false);
});

test('versioned event envelopes carry persisted sequence and deterministic metadata', () => {
  const representation = { id: 41, status: 'preparing' };
  const envelope = createOrderEventEnvelope(persistedOrder, {
    orderRepresentation: representation,
    eventId: '40000000-0000-4000-8000-000000000001',
    occurredAt: new Date('2026-08-15T10:00:01.000Z'),
  });

  assert.deepEqual(envelope, {
    protocolVersion: 1,
    eventId: '40000000-0000-4000-8000-000000000001',
    occurredAt: '2026-08-15T10:00:01.000Z',
    order: {
      id: 41,
      status: 'preparing',
      version: 2,
      updated_at: '2026-08-15T10:00:00.000Z',
    },
    orderRepresentation: representation,
  });
  assert.throws(() => createOrderEventEnvelope({ ...persistedOrder, version: 0 }));
});
