import test from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Encode,
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  resolveMfaEncryptionKey,
  totpCode,
  verifyTotp,
} from '../server/superAdminAuth.js';

const key = Buffer.from('11'.repeat(32), 'hex');

test('TOTP implementation matches the RFC 6238 SHA-1 test vector', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
  assert.equal(totpCode(secret, { now: 59_000, digits: 8 }), '94287082');
});

test('six-digit TOTP accepts bounded clock skew and rejects reuse inputs', () => {
  const secret = base32Encode(Buffer.from('a secure test secret'));
  const now = 1_700_000_000_000;
  const code = totpCode(secret, { now });
  const step = verifyTotp(secret, code, { now });

  assert.equal(step, BigInt(Math.floor(now / 1000 / 30)));
  assert.equal(verifyTotp(secret, 'not-six-digits', { now }), null);
  assert.equal(verifyTotp(secret, code, { now: now + 90_000 }), null);
});

test('MFA seeds use authenticated encryption and reject tampering', () => {
  const encrypted = encryptMfaSecret('BASE32SECRET', key);
  assert.notEqual(encrypted, 'BASE32SECRET');
  assert.equal(decryptMfaSecret(encrypted, key), 'BASE32SECRET');

  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(() => decryptMfaSecret(tampered, key));
});

test('recovery codes are high-entropy, unique, normalized, and stored only as hashes', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  assert.ok(codes.every(code => /^[A-F0-9]{5}(?:-[A-F0-9]{5}){3}$/u.test(code)));
  assert.equal(hashRecoveryCode(codes[0].toLowerCase().replaceAll('-', ''), key), hashRecoveryCode(codes[0], key));
  assert.notEqual(hashRecoveryCode(codes[0], key), codes[0]);
});

test('production requires an independent 32-byte MFA encryption key', () => {
  assert.deepEqual(resolveMfaEncryptionKey({ configuredKey: 'ab'.repeat(32), production: true }), Buffer.from('ab'.repeat(32), 'hex'));
  assert.throws(
    () => resolveMfaEncryptionKey({ configuredKey: '', jwtSecret: 'jwt', production: true }),
    /SUPER_ADMIN_MFA_ENCRYPTION_KEY/u,
  );
  assert.equal(resolveMfaEncryptionKey({ configuredKey: '', jwtSecret: 'jwt', production: false }).length, 32);
});
