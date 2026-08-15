import { createHash } from 'node:crypto';
import { ApiError, ERROR_CODES } from './errors.js';

export const PUBLIC_ORDER_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonicalize(value[key])]),
    );
  }
  return value;
};

export const publicOrderRequestHash = input => createHash('sha256')
  .update(JSON.stringify(canonicalize(input)), 'utf8')
  .digest('hex');

export const requireIdempotencyKey = header => {
  if (header === undefined || header === null || header === '') {
    throw new ApiError('Idempotency-Key header is required', {
      status: 400,
      code: ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
    });
  }
  if (typeof header !== 'string' || !KEY_PATTERN.test(header)) {
    throw new ApiError('Idempotency-Key must contain 16 to 128 safe ASCII characters', {
      status: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }
  return header;
};

const payloadConflict = () => new ApiError('Idempotency key was already used with a different order', {
  status: 409,
  code: ERROR_CODES.IDEMPOTENCY_CONFLICT,
});

const incompleteConflict = () => new ApiError('The original order request is still being resolved', {
  status: 409,
  code: ERROR_CODES.CONFLICT,
  retryAfter: 1,
});

const scopeWhere = ({ capabilityId, capabilityVersion, key }) => ({
  capability_id_capability_version_key: {
    capability_id: capabilityId,
    capability_version: capabilityVersion,
    key,
  },
});

const assertReplayable = (record, requestHash) => {
  if (record.request_hash !== requestHash) throw payloadConflict();
  if (!record.order_id) throw incompleteConflict();
  return { idempotencyId: record.id, orderId: record.order_id, replayed: true };
};

export const createPublicOrderIdempotencyService = ({ clock = () => new Date() } = {}) => {
  const begin = async (db, { organizationId, tableId, capabilityId, capabilityVersion, key, requestHash }) => {
    const where = scopeWhere({ capabilityId, capabilityVersion, key });
    const existing = await db.publicOrderIdempotency.findUnique({ where });
    const now = clock();

    if (existing && existing.expires_at > now) return assertReplayable(existing, requestHash);
    if (existing) {
      await db.publicOrderIdempotency.deleteMany({
        where: { id: existing.id, expires_at: { lte: now } },
      });
    }

    const created = await db.publicOrderIdempotency.create({
      data: {
        organization_id: organizationId,
        table_id: tableId,
        capability_id: capabilityId,
        capability_version: capabilityVersion,
        key,
        request_hash: requestHash,
        expires_at: new Date(now.getTime() + PUBLIC_ORDER_IDEMPOTENCY_TTL_MS),
      },
      select: { id: true },
    });
    return { idempotencyId: created.id, orderId: null, replayed: false };
  };

  const complete = (db, { idempotencyId, orderId }) => db.publicOrderIdempotency.update({
    where: { id: idempotencyId },
    data: { order_id: orderId },
  });

  const replayAfterUniqueConflict = async (db, { capabilityId, capabilityVersion, key, requestHash }) => {
    const record = await db.publicOrderIdempotency.findUnique({
      where: scopeWhere({ capabilityId, capabilityVersion, key }),
    });
    if (!record || record.expires_at <= clock()) throw incompleteConflict();
    return assertReplayable(record, requestHash);
  };

  return { begin, complete, replayAfterUniqueConflict };
};

export const isPublicOrderIdempotencyUniqueConflict = error => {
  const target = JSON.stringify(error?.meta?.target || '');
  return error?.code === 'P2002'
    && error?.meta?.modelName === 'PublicOrderIdempotency'
    && target.includes('capability_id')
    && target.includes('capability_version')
    && target.includes('key');
};
