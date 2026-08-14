import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  TOKEN_TYPES,
  issueToken,
  verifyAuthToken,
  verifyToken,
} from '../server/tokenPolicy.js';

const secret = 'test-only-token-secret';

test('token classes carry explicit issuer, audience, purpose, and expiry', () => {
  const token = issueToken(TOKEN_TYPES.RESTAURANT_SESSION, { id: 'restaurant-1' }, secret, {
    subject: 'identity-1',
  });
  const decoded = jwt.decode(token);

  assert.equal(decoded.iss, 'bolt-qr-api');
  assert.equal(decoded.aud, 'restaurant-api');
  assert.equal(decoded.purpose, TOKEN_TYPES.RESTAURANT_SESSION);
  assert.equal(decoded.sub, 'identity-1');
  assert.ok(decoded.exp > decoded.iat);
  assert.equal(verifyAuthToken(token, secret).id, 'restaurant-1');
});

test('table sessions use a dedicated audience and 30-minute lifetime', () => {
  const token = issueToken(TOKEN_TYPES.TABLE_SESSION, {
    capabilityId: 'capability-1',
    tableId: 42,
  }, secret, { subject: 'capability-1' });
  const decoded = jwt.decode(token);

  assert.equal(decoded.aud, 'table-ordering');
  assert.equal(decoded.purpose, TOKEN_TYPES.TABLE_SESSION);
  assert.equal(decoded.sub, 'capability-1');
  assert.equal(decoded.exp - decoded.iat, 30 * 60);
  assert.equal(verifyToken(TOKEN_TYPES.TABLE_SESSION, token, secret).tableId, 42);
  assert.throws(() => verifyAuthToken(token, secret), /Invalid authentication token/);
});

test('authentication verification rejects tracking tokens and wrong audiences', () => {
  const trackingToken = issueToken(TOKEN_TYPES.ORDER_TRACKING, { orderId: 42 }, secret);

  assert.throws(() => verifyAuthToken(trackingToken, secret), /Invalid authentication token/);
  assert.throws(
    () => verifyToken(TOKEN_TYPES.RESTAURANT_SESSION, trackingToken, secret),
    /audience invalid|Invalid authentication token/i,
  );
});

test('expired tokens are rejected', () => {
  const expired = jwt.sign(
    { purpose: TOKEN_TYPES.RESTAURANT_SESSION },
    secret,
    { issuer: 'bolt-qr-api', audience: 'restaurant-api', expiresIn: -1 },
  );

  assert.throws(() => verifyToken(TOKEN_TYPES.RESTAURANT_SESSION, expired, secret));
});
