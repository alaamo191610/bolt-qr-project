import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRestaurantInvitationToken,
  hashRestaurantInvitationToken,
  isRestaurantInvitationToken,
} from '../server/restaurantInvitations.js';

test('restaurant invitation tokens contain 256 random bits and are stored only as hashes', () => {
  const first = generateRestaurantInvitationToken();
  const second = generateRestaurantInvitationToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(isRestaurantInvitationToken(first), true);
  assert.notEqual(first, second);
  assert.match(hashRestaurantInvitationToken(first), /^[a-f0-9]{64}$/u);
  assert.notEqual(hashRestaurantInvitationToken(first), first);
  assert.equal(isRestaurantInvitationToken('short-token'), false);
});
