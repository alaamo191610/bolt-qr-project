import { ApiError } from '../services/api';

const NETWORK_ERROR_MESSAGE = 'Could not connect. Check your internet connection and try again.';
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.';
// ADR 0007 commits to a three-open-order cap and a restaurant pause/closed/
// overloaded control, but Yazan hasn't shipped or published the actual error
// codes yet (M2 point after idempotency). These names follow the existing
// TABLE_SESSION_* pattern as a best-effort default - confirm against the
// real contract once it lands; an unmatched code just falls through to the
// generic message below, so this is harmless until then.
const ORDER_LIMIT_MESSAGE = 'This table already has the maximum number of open orders. Please wait for one to be served before ordering again.';
const RESTAURANT_PAUSED_MESSAGE = "This restaurant isn't accepting new orders right now. Please ask staff or try again shortly.";

export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') return NETWORK_ERROR_MESSAGE;
    if (error.code === 'SERVER_ERROR') return SERVER_ERROR_MESSAGE;
    if (error.code === 'ORDER_LIMIT_REACHED') return ORDER_LIMIT_MESSAGE;
    if (error.code === 'RESTAURANT_PAUSED') return RESTAURANT_PAUSED_MESSAGE;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
