import test from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES } from '../server/errors.js';
import {
  PUBLIC_ORDER_IDEMPOTENCY_TTL_MS,
  publicOrderRequestHash,
  requireIdempotencyKey,
} from '../server/orderIdempotency.js';

test('public order request hashing is stable for object key order but preserves line order', () => {
  const first = publicOrderRequestHash({
    type: 'dine_in',
    items: [{ menuId: 1, quantity: 2 }, { menuId: 2, quantity: 1 }],
    tipPercent: 0,
  });
  const equivalent = publicOrderRequestHash({
    tipPercent: 0,
    items: [{ quantity: 2, menuId: 1 }, { quantity: 1, menuId: 2 }],
    type: 'dine_in',
  });
  const changed = publicOrderRequestHash({
    type: 'dine_in',
    items: [{ menuId: 2, quantity: 1 }, { menuId: 1, quantity: 2 }],
    tipPercent: 0,
  });

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, equivalent);
  assert.notEqual(first, changed);
  assert.equal(PUBLIC_ORDER_IDEMPOTENCY_TTL_MS, 24 * 60 * 60 * 1000);
});

test('public order idempotency keys are required and strictly bounded', () => {
  assert.equal(requireIdempotencyKey('018f8f4d-8f65-7a34-b321-123456789abc'), '018f8f4d-8f65-7a34-b321-123456789abc');
  assert.throws(
    () => requireIdempotencyKey(undefined),
    error => error.code === ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED && error.status === 400,
  );
  assert.throws(
    () => requireIdempotencyKey('short key'),
    error => error.code === ERROR_CODES.VALIDATION_ERROR && error.status === 400,
  );
});
