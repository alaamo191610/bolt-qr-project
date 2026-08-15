// Reads a claim out of a JWT the client already holds, without verifying
// the signature - purely for UI convenience (e.g. deciding what to show).
// The server independently verifies and enforces every real request, so an
// unreadable/tampered token here just means the UI falls back to nothing.
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded)) as T;
  } catch {
    return null;
  }
}
