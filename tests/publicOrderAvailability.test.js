import test from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES } from '../server/errors.js';
import {
  assertPublicOrderAvailable,
  createPublicOrderRejectionTelemetry,
} from '../server/publicOrderAvailability.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const branchId = '00000000-0000-4000-8000-000000000002';
const base = {
  organizationId,
  branch: { id: branchId, organization_id: organizationId, active: true, ordering_state: 'OPEN' },
  table: { id: 42, branch_id: branchId, status: 'available' },
};

test('public availability permits only open branches and orderable table states', () => {
  assert.doesNotThrow(() => assertPublicOrderAvailable(base));
  assert.doesNotThrow(() => assertPublicOrderAvailable({
    ...base,
    table: { ...base.table, status: 'occupied' },
  }));

  const cases = [
    [{ ...base.branch, ordering_state: 'PAUSED' }, base.table, ERROR_CODES.RESTAURANT_PAUSED],
    [{ ...base.branch, ordering_state: 'CLOSED' }, base.table, ERROR_CODES.RESTAURANT_CLOSED],
    [{ ...base.branch, ordering_state: 'OVERLOADED' }, base.table, ERROR_CODES.RESTAURANT_OVERLOADED],
    [{ ...base.branch, active: false }, base.table, ERROR_CODES.RESTAURANT_CLOSED],
    [base.branch, { ...base.table, status: 'reserved' }, ERROR_CODES.TABLE_UNAVAILABLE],
    [null, base.table, ERROR_CODES.TABLE_UNAVAILABLE],
    [{ ...base.branch, organization_id: '00000000-0000-4000-8000-000000000003' }, base.table, ERROR_CODES.TABLE_UNAVAILABLE],
  ];
  for (const [branch, table, code] of cases) {
    assert.throws(
      () => assertPublicOrderAvailable({ organizationId, branch, table }),
      error => error.status === 409 && error.code === code,
    );
  }
});

test('public rejection telemetry emits only allowlisted identifiers, reason, and counters', () => {
  const lines = [];
  const telemetry = createPublicOrderRejectionTelemetry({ logger: line => lines.push(line) });
  const recorded = telemetry.record({
    requestId: 'request-1',
    organizationId,
    branchId,
    tableId: 42,
    reasonCode: ERROR_CODES.ORDER_LIMIT_REACHED,
    counters: {
      openOrderCount: 3,
      orderLimit: 3,
      basket: 'secret basket',
      token: 'secret token',
    },
    body: { notes: 'customer secret' },
  });

  assert.equal(recorded, true);
  assert.deepEqual(JSON.parse(lines[0]), {
    event: 'public_order_rejected',
    requestId: 'request-1',
    organizationId,
    branchId,
    tableId: 42,
    reasonCode: ERROR_CODES.ORDER_LIMIT_REACHED,
    counters: { openOrderCount: 3, orderLimit: 3 },
  });
  assert.equal(lines[0].includes('secret'), false);
  assert.equal(telemetry.record({ reasonCode: ERROR_CODES.VALIDATION_ERROR }), false);
  assert.equal(lines.length, 1);
});
