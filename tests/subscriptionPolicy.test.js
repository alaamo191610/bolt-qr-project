import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUBSCRIPTION_PLANS,
  hasRestaurantAccess,
  validateSubscriptionInput,
} from '../server/subscriptionPolicy.js';

const now = new Date('2026-08-16T12:00:00.000Z');

test('subscription access accepts only current ACTIVE and TRIAL subscriptions', () => {
  assert.equal(hasRestaurantAccess({ subscription_status: 'ACTIVE', subscription_end: null }, now), true);
  assert.equal(hasRestaurantAccess({
    subscription_status: 'ACTIVE',
    subscription_end: new Date('2026-08-17T12:00:00.000Z'),
  }, now), true);
  assert.equal(hasRestaurantAccess({
    subscription_status: 'ACTIVE',
    subscription_end: new Date('2026-08-15T12:00:00.000Z'),
  }, now), false);
  assert.equal(hasRestaurantAccess({
    subscription_status: 'TRIAL',
    trial_ends_at: new Date('2026-08-17T12:00:00.000Z'),
  }, now), true);
  assert.equal(hasRestaurantAccess({ subscription_status: 'TRIAL', trial_ends_at: null }, now), false);
  assert.equal(hasRestaurantAccess({ subscription_status: 'PAST_DUE' }, now), false);
  assert.equal(hasRestaurantAccess({ subscription_status: 'CANCELLED' }, now), false);
});

test('subscription input derives immutable limits and requires a future trial expiry', () => {
  const trial = validateSubscriptionInput({
    plan: 'basic',
    status: 'trial',
    trialEndsAt: '2026-08-20T12:00:00.000Z',
    now,
    allowInactive: false,
  });
  assert.deepEqual(trial.limits, SUBSCRIPTION_PLANS.BASIC);
  assert.equal(trial.subscriptionEnd, null);
  assert.equal(trial.trialEndsAt.toISOString(), '2026-08-20T12:00:00.000Z');

  assert.throws(() => validateSubscriptionInput({
    plan: 'PRO', status: 'TRIAL', now, allowInactive: false,
  }), /trialEndsAt is required/u);
  assert.throws(() => validateSubscriptionInput({
    plan: 'PRO', status: 'CANCELLED', now, allowInactive: false,
  }), /must start with an active or trial/u);
  assert.equal(SUBSCRIPTION_PLANS.PRO.max_tables, 500);
  assert.equal(SUBSCRIPTION_PLANS.PRO.max_menu_items, 2_000);
});
