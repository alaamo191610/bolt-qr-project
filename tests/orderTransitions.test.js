import test from 'node:test';
import assert from 'node:assert/strict';
import { ORDER_STATUSES, canTransitionOrder } from '../server/orderTransitions.js';

test('order status matrix permits the forward workflow and cancellation', () => {
  assert.deepEqual([...ORDER_STATUSES].sort(), ['cancelled', 'pending', 'preparing', 'ready', 'served']);
  assert.equal(canTransitionOrder('pending', 'preparing'), true);
  assert.equal(canTransitionOrder('preparing', 'ready'), true);
  assert.equal(canTransitionOrder('ready', 'served'), true);
  assert.equal(canTransitionOrder('pending', 'cancelled'), true);
  assert.equal(canTransitionOrder('preparing', 'cancelled'), true);
  assert.equal(canTransitionOrder('ready', 'cancelled'), true);
});

test('terminal orders cannot be reopened or moved backwards', () => {
  assert.equal(canTransitionOrder('served', 'pending'), false);
  assert.equal(canTransitionOrder('cancelled', 'preparing'), false);
  assert.equal(canTransitionOrder('ready', 'pending'), false);
  assert.equal(canTransitionOrder('unknown', 'ready'), false);
});
