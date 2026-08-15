import { ApiError } from '../services/api';

const NETWORK_ERROR_MESSAGE = 'Could not connect. Check your internet connection and try again.';
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.';
// Public ordering state codes are published in the capacity and availability contracts.
const ORDER_LIMIT_MESSAGE = 'This table already has the maximum number of open orders. Please wait for one to be served before ordering again.';
const RESTAURANT_PAUSED_MESSAGE = "This restaurant isn't accepting new orders right now. Please ask staff or try again shortly.";
const RESTAURANT_CLOSED_MESSAGE = 'This restaurant location is currently closed to new orders.';
const RESTAURANT_OVERLOADED_MESSAGE = 'The kitchen is temporarily unable to accept more orders. Please try again shortly.';
const TABLE_UNAVAILABLE_MESSAGE = 'This table is not currently available for ordering. Please ask restaurant staff for help.';

export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') return NETWORK_ERROR_MESSAGE;
    if (error.code === 'SERVER_ERROR') return SERVER_ERROR_MESSAGE;
    if (error.code === 'ORDER_LIMIT_REACHED') return ORDER_LIMIT_MESSAGE;
    if (error.code === 'RESTAURANT_PAUSED') return RESTAURANT_PAUSED_MESSAGE;
    if (error.code === 'RESTAURANT_CLOSED') return RESTAURANT_CLOSED_MESSAGE;
    if (error.code === 'RESTAURANT_OVERLOADED') return RESTAURANT_OVERLOADED_MESSAGE;
    if (error.code === 'TABLE_UNAVAILABLE') return TABLE_UNAVAILABLE_MESSAGE;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
