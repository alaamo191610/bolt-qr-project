import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import bcrypt from 'bcryptjs';
import { TOKEN_TYPES, issueToken, verifyToken } from './tokenPolicy.js';

export const SUPER_ADMIN_SESSION_TTL_SECONDS = 30 * 60;
export const SUPER_ADMIN_RECENT_AUTH_SECONDS = 10 * 60;
export const SUPER_ADMIN_MFA_CHALLENGE_SECONDS = 5 * 60;
export const SUPER_ADMIN_MFA_MAX_ATTEMPTS = 5;
export const SUPER_ADMIN_MFA_LOCK_SECONDS = 15 * 60;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const authError = (message, { status = 401, code = 'AUTHENTICATION_REQUIRED', retryAfter } = {}) =>
  Object.assign(new Error(message), { status, code, ...(retryAfter === undefined ? {} : { retryAfter }) });

export const base32Encode = buffer => {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let encoded = '';
  for (let index = 0; index < bits.length; index += 5) {
    encoded += BASE32_ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  }
  return encoded;
};

export const base32Decode = value => {
  const normalized = String(value || '').toUpperCase().replace(/=+$/u, '').replace(/\s+/gu, '');
  if (!normalized || [...normalized].some(character => !BASE32_ALPHABET.includes(character))) {
    throw new Error('Invalid Base32 secret');
  }
  let bits = '';
  for (const character of normalized) {
    bits += BASE32_ALPHABET.indexOf(character).toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
};

export const generateTotpSecret = () => base32Encode(randomBytes(20));

export const totpCode = (secret, {
  now = Date.now(),
  periodSeconds = 30,
  digits = 6,
  algorithm = 'sha1',
  step,
} = {}) => {
  const counter = step === undefined
    ? BigInt(Math.floor(Number(now) / 1000 / periodSeconds))
    : BigInt(step);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const digest = createHmac(algorithm, base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits);
  return String(value).padStart(digits, '0');
};

export const verifyTotp = (secret, code, { now = Date.now(), window = 1 } = {}) => {
  const normalized = String(code || '').trim();
  if (!/^\d{6}$/u.test(normalized)) return null;
  const currentStep = Math.floor(Number(now) / 1000 / 30);
  const supplied = Buffer.from(normalized);
  for (let offset = -window; offset <= window; offset += 1) {
    const step = currentStep + offset;
    const candidate = Buffer.from(totpCode(secret, { step }));
    if (candidate.length === supplied.length && timingSafeEqual(candidate, supplied)) return BigInt(step);
  }
  return null;
};

export const resolveMfaEncryptionKey = ({
  configuredKey = process.env.SUPER_ADMIN_MFA_ENCRYPTION_KEY,
  jwtSecret,
  production = process.env.NODE_ENV === 'production',
} = {}) => {
  if (typeof configuredKey === 'string' && /^[a-f0-9]{64}$/iu.test(configuredKey)) {
    return Buffer.from(configuredKey, 'hex');
  }
  if (production) {
    throw new Error('SUPER_ADMIN_MFA_ENCRYPTION_KEY must be a dedicated 64-character hex key in production');
  }
  if (!jwtSecret) throw new Error('A development JWT secret is required to derive the local MFA key');
  return createHash('sha256').update(`development-super-admin-mfa:${jwtSecret}`).digest();
};

export const encryptMfaSecret = (secret, key) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
};

export const decryptMfaSecret = (encrypted, key) => {
  const [version, iv, tag, ciphertext] = String(encrypted || '').split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Invalid encrypted MFA secret');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

const normalizeRecoveryCode = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/gu, '');

export const generateRecoveryCodes = (count = 8) => Array.from({ length: count }, () => {
  const raw = randomBytes(10).toString('hex').toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
});

export const hashRecoveryCode = (code, key) => createHmac('sha256', key)
  .update(normalizeRecoveryCode(code))
  .digest('hex');

const publicUser = superAdmin => ({
  id: superAdmin.id,
  email: superAdmin.email,
  name: superAdmin.name,
  role: 'SUPER_ADMIN',
});

export const createSuperAdminAuthService = ({ db, tokenSecret, encryptionKey, clock = () => new Date() }) => {
  if (!db) throw new Error('SuperAdmin authentication database is required');
  if (!tokenSecret) throw new Error('SuperAdmin token secret is required');
  if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32) {
    throw new Error('SuperAdmin MFA encryption key must be 32 bytes');
  }

  const issueChallenge = superAdmin => issueToken(TOKEN_TYPES.SUPER_ADMIN_MFA_CHALLENGE, {
    id: superAdmin.id,
    role: 'SUPER_ADMIN_MFA_CHALLENGE',
    sessionVersion: superAdmin.session_version,
  }, tokenSecret, { subject: superAdmin.id });

  const issueSession = superAdmin => {
    const authenticatedAt = clock();
    return issueToken(TOKEN_TYPES.SUPER_ADMIN_SESSION, {
      id: superAdmin.id,
      email: superAdmin.email,
      role: 'SUPER_ADMIN',
      mfa: true,
      sessionVersion: superAdmin.session_version,
      authTime: Math.floor(authenticatedAt.getTime() / 1000),
    }, tokenSecret, { subject: superAdmin.id });
  };

  const assertNotLocked = superAdmin => {
    const now = clock();
    if (superAdmin.mfa_locked_until && superAdmin.mfa_locked_until > now) {
      const retryAfter = Math.max(1, Math.ceil((superAdmin.mfa_locked_until.getTime() - now.getTime()) / 1000));
      throw authError('Multi-factor authentication is temporarily locked', {
        status: 429,
        code: 'SUPER_ADMIN_MFA_LOCKED',
        retryAfter,
      });
    }
  };

  const recordFailure = async superAdmin => {
    const now = clock();
    const incremented = await db.superAdmin.updateMany({
      where: {
        id: superAdmin.id,
        mfa_failed_attempts: { lt: SUPER_ADMIN_MFA_MAX_ATTEMPTS - 1 },
        OR: [
          { mfa_locked_until: null },
          { mfa_locked_until: { lte: now } },
        ],
      },
      data: { mfa_failed_attempts: { increment: 1 } },
    });
    if (incremented.count === 1) {
      throw authError('Invalid multi-factor authentication code', { code: 'SUPER_ADMIN_MFA_INVALID' });
    }

    const lockedUntil = new Date(now.getTime() + SUPER_ADMIN_MFA_LOCK_SECONDS * 1000);
    await db.superAdmin.update({
      where: { id: superAdmin.id },
      data: { mfa_failed_attempts: 0, mfa_locked_until: lockedUntil },
    });
    throw authError('Multi-factor authentication is temporarily locked', {
      status: 429,
      code: 'SUPER_ADMIN_MFA_LOCKED',
      retryAfter: SUPER_ADMIN_MFA_LOCK_SECONDS,
    });
  };

  const beginLogin = async ({ email, password }) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const superAdmin = normalizedEmail
      ? await db.superAdmin.findFirst({ where: { email: { equals: normalizedEmail, mode: 'insensitive' } } })
      : null;
    if (!superAdmin || !superAdmin.active || !(await bcrypt.compare(String(password || ''), superAdmin.password))) {
      throw authError('Invalid credentials');
    }
    assertNotLocked(superAdmin);

    if (!superAdmin.mfa_enabled_at) {
      const secret = generateTotpSecret();
      const pending = await db.superAdmin.update({
        where: { id: superAdmin.id },
        data: {
          mfa_secret_encrypted: encryptMfaSecret(secret, encryptionKey),
          mfa_last_used_step: null,
          mfa_recovery_code_hashes: [],
          mfa_failed_attempts: 0,
          mfa_locked_until: null,
        },
      });
      const label = encodeURIComponent(`QR:${pending.email}`);
      const issuer = encodeURIComponent('QR');
      return {
        mfaRequired: true,
        enrollmentRequired: true,
        challengeToken: issueChallenge(pending),
        enrollment: {
          secret,
          otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
        },
      };
    }

    return {
      mfaRequired: true,
      enrollmentRequired: false,
      challengeToken: issueChallenge(superAdmin),
    };
  };

  const completeLogin = async ({ challengeToken, code, recoveryCode }) => {
    let claims;
    try {
      claims = verifyToken(TOKEN_TYPES.SUPER_ADMIN_MFA_CHALLENGE, String(challengeToken || ''), tokenSecret);
    } catch {
      throw authError('Multi-factor authentication challenge is invalid or expired');
    }
    if (claims.role !== 'SUPER_ADMIN_MFA_CHALLENGE' || typeof claims.id !== 'string') {
      throw authError('Multi-factor authentication challenge is invalid or expired');
    }

    const superAdmin = await db.superAdmin.findUnique({ where: { id: claims.id } });
    if (!superAdmin || !superAdmin.active || superAdmin.session_version !== claims.sessionVersion) {
      throw authError('Multi-factor authentication challenge is invalid or expired');
    }
    assertNotLocked(superAdmin);
    if (!superAdmin.mfa_secret_encrypted) return recordFailure(superAdmin);

    const now = clock();
    let usedStep = null;
    let remainingRecoveryHashes = null;
    if (recoveryCode) {
      const suppliedHash = hashRecoveryCode(recoveryCode, encryptionKey);
      const recoveryIndex = superAdmin.mfa_recovery_code_hashes.findIndex(hash => {
        const expected = Buffer.from(hash, 'hex');
        const supplied = Buffer.from(suppliedHash, 'hex');
        return expected.length === supplied.length && timingSafeEqual(expected, supplied);
      });
      if (recoveryIndex >= 0) {
        remainingRecoveryHashes = [...superAdmin.mfa_recovery_code_hashes];
        remainingRecoveryHashes.splice(recoveryIndex, 1);
      }
    } else {
      const secret = decryptMfaSecret(superAdmin.mfa_secret_encrypted, encryptionKey);
      usedStep = verifyTotp(secret, code, { now: now.getTime() });
      if (usedStep !== null && superAdmin.mfa_last_used_step !== null
        && usedStep <= superAdmin.mfa_last_used_step) {
        usedStep = null;
      }
    }
    if (usedStep === null && remainingRecoveryHashes === null) return recordFailure(superAdmin);

    const enrollment = !superAdmin.mfa_enabled_at;
    const recoveryCodes = enrollment ? generateRecoveryCodes() : undefined;
    let updated;
    try {
      updated = await db.$transaction(async tx => {
      const current = await tx.superAdmin.findUnique({ where: { id: superAdmin.id } });
      if (!current || !current.active || current.session_version !== claims.sessionVersion) {
        throw authError('Multi-factor authentication challenge is invalid or expired');
      }
      if (usedStep !== null && current.mfa_last_used_step !== null && usedStep <= current.mfa_last_used_step) {
        throw authError('Invalid multi-factor authentication code', { code: 'SUPER_ADMIN_MFA_INVALID' });
      }
      if (remainingRecoveryHashes !== null) {
        const suppliedHash = hashRecoveryCode(recoveryCode, encryptionKey);
        if (!current.mfa_recovery_code_hashes.includes(suppliedHash)) {
          throw authError('Invalid multi-factor authentication code', { code: 'SUPER_ADMIN_MFA_INVALID' });
        }
      }
      return tx.superAdmin.update({
        where: { id: current.id },
        data: {
          mfa_enabled_at: current.mfa_enabled_at || now,
          mfa_last_used_step: usedStep === null ? current.mfa_last_used_step : usedStep,
          mfa_recovery_code_hashes: enrollment
            ? recoveryCodes.map(recoveryCodeValue => hashRecoveryCode(recoveryCodeValue, encryptionKey))
            : (remainingRecoveryHashes || current.mfa_recovery_code_hashes),
          mfa_failed_attempts: 0,
          mfa_locked_until: null,
          last_login: now,
          ...(enrollment ? { session_version: { increment: 1 } } : {}),
        },
      });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error?.code === 'P2034') {
        throw authError('Invalid multi-factor authentication code', { code: 'SUPER_ADMIN_MFA_INVALID' });
      }
      throw error;
    }

    return {
      token: issueSession(updated),
      user: publicUser(updated),
      ...(recoveryCodes ? { recoveryCodes } : {}),
    };
  };

  const revokeSessions = async superAdminId => db.superAdmin.update({
    where: { id: superAdminId },
    data: { session_version: { increment: 1 } },
    select: { session_version: true },
  });

  return { beginLogin, completeLogin, revokeSessions };
};
