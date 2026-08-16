export const SUBSCRIPTION_PLANS = Object.freeze({
  STANDARD: Object.freeze({ max_tables: 10, max_menu_items: 50, max_staff_accounts: 1 }),
  BASIC: Object.freeze({ max_tables: 25, max_menu_items: 150, max_staff_accounts: 3 }),
  PRO: Object.freeze({ max_tables: 500, max_menu_items: 2_000, max_staff_accounts: 10 }),
});

export const SUBSCRIPTION_STATUSES = Object.freeze([
  'ACTIVE',
  'TRIAL',
  'PAST_DUE',
  'CANCELLED',
]);

export const planLimits = plan => SUBSCRIPTION_PLANS[plan] || null;

const isFuture = (value, now) => value instanceof Date
  && !Number.isNaN(value.getTime())
  && value.getTime() > now.getTime();

export const hasRestaurantAccess = (subscription, now = new Date()) => {
  if (!subscription) return false;
  if (subscription.subscription_status === 'TRIAL') {
    return isFuture(subscription.trial_ends_at, now);
  }
  if (subscription.subscription_status === 'ACTIVE') {
    return subscription.subscription_end == null || isFuture(subscription.subscription_end, now);
  }
  return false;
};

export const parseOptionalFutureDate = (value, field, now = new Date()) => {
  if (value == null || value === '') return null;
  const parsed = new Date(value);
  if (!isFuture(parsed, now)) {
    throw Object.assign(new Error(`${field} must be a valid future date`), { status: 400 });
  }
  return parsed;
};

export const validateSubscriptionInput = ({
  plan,
  status,
  subscriptionEnd,
  trialEndsAt,
  now = new Date(),
  allowInactive = true,
}) => {
  const normalizedPlan = String(plan || '').toUpperCase();
  const normalizedStatus = String(status || '').toUpperCase();
  const limits = planLimits(normalizedPlan);
  if (!limits || !SUBSCRIPTION_STATUSES.includes(normalizedStatus)) {
    throw Object.assign(new Error('Invalid subscription plan or status'), { status: 400 });
  }
  if (!allowInactive && !['ACTIVE', 'TRIAL'].includes(normalizedStatus)) {
    throw Object.assign(new Error('New restaurants must start with an active or trial subscription'), { status: 400 });
  }

  const parsedSubscriptionEnd = parseOptionalFutureDate(subscriptionEnd, 'subscriptionEnd', now);
  const parsedTrialEndsAt = parseOptionalFutureDate(trialEndsAt, 'trialEndsAt', now);
  if (normalizedStatus === 'TRIAL' && !parsedTrialEndsAt) {
    throw Object.assign(new Error('trialEndsAt is required for a trial subscription'), { status: 400 });
  }

  return {
    plan: normalizedPlan,
    status: normalizedStatus,
    subscriptionEnd: normalizedStatus === 'ACTIVE' ? parsedSubscriptionEnd : null,
    trialEndsAt: normalizedStatus === 'TRIAL' ? parsedTrialEndsAt : null,
    limits,
  };
};
