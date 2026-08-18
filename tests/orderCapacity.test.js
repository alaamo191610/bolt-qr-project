import test from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES } from '../server/errors.js';
import {
  PUBLIC_ORDER_OPEN_LIMIT,
  PUBLIC_ORDER_TABLE_OPEN_LIMIT,
  PUBLIC_ORDER_OPEN_STATUSES,
  enforcePublicOrderCapacity,
} from '../server/orderCapacity.js';

const scope = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  tableId: 42,
  tableSessionId: '00000000-0000-4000-8000-000000000002',
};

test('public order capacity counts both session and table scopes', async () => {
  const receivedWhere = [];
  const result = await enforcePublicOrderCapacity({
    order: {
      count: async ({ where }) => {
        receivedWhere.push(where);
        return where.table_session_id === scope.tableSessionId ? 2 : 3;
      },
    },
  }, scope);

  assert.deepEqual(receivedWhere, [{
    organization_id: scope.organizationId,
    table_id: scope.tableId,
    table_session_id: scope.tableSessionId,
    status: { in: ['pending', 'preparing', 'ready'] },
  }, {
    organization_id: scope.organizationId,
    table_id: scope.tableId,
    table_session_id: { not: null },
    status: { in: ['pending', 'preparing', 'ready'] },
  }]);
  assert.deepEqual(PUBLIC_ORDER_OPEN_STATUSES, ['pending', 'preparing', 'ready']);
  assert.deepEqual(result, {
    openOrderCount: 3,
    limit: PUBLIC_ORDER_TABLE_OPEN_LIMIT,
    sessionOpenOrderCount: 2,
    tableOpenOrderCount: 3,
  });
  assert.equal(PUBLIC_ORDER_OPEN_LIMIT, 4);
  assert.equal(PUBLIC_ORDER_TABLE_OPEN_LIMIT, 4);
});

test('public order capacity returns a stable state conflict at four table orders', async () => {
  await assert.rejects(
    enforcePublicOrderCapacity({
      order: {
        count: async ({ where }) => where.table_session_id === scope.tableSessionId ? 1 : 4,
      },
    }, scope),
    error => error.status === 409 && error.code === ERROR_CODES.ORDER_LIMIT_REACHED,
  );
});
