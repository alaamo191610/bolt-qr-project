import { ApiError, ERROR_CODES } from './errors.js';

const oldestEntry = entries => {
  let oldestKey;
  let oldestTimestamp = Infinity;
  for (const [key, value] of entries) {
    if (value.resetAt < oldestTimestamp) {
      oldestKey = key;
      oldestTimestamp = value.resetAt;
    }
  }
  return oldestKey;
};

export const createRateLimiter = ({
  windowMs,
  max,
  maxEntries = 10_000,
  key = req => `${req.ip}:${req.path}`,
  store = new Map(),
  clock = () => Date.now(),
} = {}) => {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error('windowMs must be positive');
  if (!Number.isInteger(max) || max <= 0) throw new Error('max must be a positive integer');
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) throw new Error('maxEntries must be positive');

  let lastSweepAt = 0;
  const sweep = now => {
    if (now - lastSweepAt < windowMs) return;
    for (const [entryKey, entry] of store) {
      if (entry.resetAt <= now) store.delete(entryKey);
    }
    lastSweepAt = now;
  };

  const limiter = (req, _res, next) => {
    const now = clock();
    sweep(now);
    const entryKey = String(key(req));
    let entry = store.get(entryKey);

    if (!entry || entry.resetAt <= now) {
      while (store.size >= maxEntries) {
        const evictedKey = oldestEntry(store);
        if (evictedKey === undefined) break;
        store.delete(evictedKey);
      }
      entry = { count: 1, resetAt: now + windowMs };
      store.set(entryKey, entry);
      return next();
    }

    if (entry.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      return next(new ApiError('Too many requests. Please try again later.', {
        status: 429,
        code: ERROR_CODES.RATE_LIMITED,
        retryAfter,
      }));
    }

    entry.count += 1;
    return next();
  };

  limiter.reset = () => store.clear();
  limiter.size = () => store.size;
  limiter.store = store;
  return limiter;
};
