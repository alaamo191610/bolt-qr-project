import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './errors';
import { ApiError } from '../services/api';

describe('getErrorMessage', () => {
  it('returns a friendly connection message for a NETWORK_ERROR, not the raw fetch failure', () => {
    const error = new ApiError({ message: 'TypeError: Failed to fetch', code: 'NETWORK_ERROR' });
    expect(getErrorMessage(error)).toMatch(/internet connection/i);
  });

  it('returns a friendly retry message for a SERVER_ERROR, not the raw server text', () => {
    const error = new ApiError({ message: 'relation "admins" does not exist', status: 500, code: 'SERVER_ERROR' });
    expect(getErrorMessage(error)).toMatch(/went wrong on our end/i);
    expect(getErrorMessage(error)).not.toContain('relation');
  });

  it('passes the real message through unchanged for other ApiError codes', () => {
    const error = new ApiError({ message: 'Email is already registered', status: 409, code: 'CONFLICT' });
    expect(getErrorMessage(error)).toBe('Email is already registered');
  });

  it('passes plain Error messages through unchanged', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('falls back to the caller-provided message for non-Error values', () => {
    expect(getErrorMessage('a string', 'fallback')).toBe('fallback');
    expect(getErrorMessage(null, 'fallback')).toBe('fallback');
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
  });
});
