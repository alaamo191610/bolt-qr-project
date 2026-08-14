import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateTableCapability,
  hashTableCapability,
  isTableCapability,
} from '../server/tableCapability.js';

test('table capabilities contain 256 random bits in canonical base64url form', () => {
  const first = generateTableCapability();
  const second = generateTableCapability();

  assert.equal(first.length, 43);
  assert.equal(Buffer.from(first, 'base64url').length, 32);
  assert.equal(isTableCapability(first), true);
  assert.notEqual(first, second);
});

test('capability hashing is deterministic and does not retain the bearer secret', () => {
  const capability = generateTableCapability();
  const hash = hashTableCapability(capability);

  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, hashTableCapability(capability));
  assert.notEqual(hash, capability);
  assert.equal(isTableCapability('A-01'), false);
  assert.equal(isTableCapability(''), false);
});
