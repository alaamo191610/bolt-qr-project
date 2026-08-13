import { ApiError } from '../services/api';

const NETWORK_ERROR_MESSAGE = 'Could not connect. Check your internet connection and try again.';
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.';

export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') return NETWORK_ERROR_MESSAGE;
    if (error.code === 'SERVER_ERROR') return SERVER_ERROR_MESSAGE;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
