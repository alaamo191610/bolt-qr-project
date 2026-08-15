import { ApiError } from '../services/api';

const NETWORK_ERROR_MESSAGE = 'Could not connect. Check your internet connection and try again.';
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.';
// ORDER_LIMIT_REACHED is published in docs/contracts/order-capacity.md.
// RESTAURANT_PAUSED remains the provisional name for the next M2 control.
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
