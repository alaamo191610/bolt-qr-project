import test from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES } from '../server/errors.js';
import {
  PUBLIC_ORDER_OPEN_LIMIT,
  PUBLIC_ORDER_OPEN_STATUSES,
  enforcePublicOrderCapacity,
} from '../server/orderCapacity.js';

const scope = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  tableId: 42,
  tableSessionId: '00000000-0000-4000-8000-000000000002',
};

test('public order capacity counts only open orders in the authenticated session scope', async () => {
  let receivedWhere;
  const result = await enforcePublicOrderCapacity({
    order: {
      count: async ({ where }) => {
        receivedWhere = where;
        return 2;
      },
    },
  }, scope);

  assert.deepEqual(receivedWhere, {
    organization_id: scope.organizationId,
    table_id: scope.tableId,
    table_session_id: scope.tableSessionId,
    status: { in: ['pending', 'preparing', 'ready'] },
  });
  assert.deepEqual(PUBLIC_ORDER_OPEN_STATUSES, ['pending', 'preparing', 'ready']);
  assert.deepEqual(result, { openOrderCount: 2, limit: PUBLIC_ORDER_OPEN_LIMIT });
});

test('public order capacity returns a stable state conflict at three open orders', async () => {
  await assert.rejects(
    enforcePublicOrderCapacity({ order: { count: async () => 3 } }, scope),
    error => error.status === 409 && error.code === ERROR_CODES.ORDER_LIMIT_REACHED,
  );
});
