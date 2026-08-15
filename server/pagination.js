const INTEGER_ID = /^\d+$/u;
const UUID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class PaginationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaginationError';
    this.status = 400;
    this.code = 'INVALID_PAGINATION';
  }
}

const parseLimit = (value, defaultLimit, maxLimit) => {
  if (value == null || value === '') return defaultLimit;
  if (!/^\d+$/u.test(String(value))) throw new PaginationError('Pagination limit must be an integer');
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new PaginationError(`Pagination limit must be between 1 and ${maxLimit}`);
  }
  return limit;
};

const normalizeId = (value, idType) => {
  const candidate = String(value ?? '');
  if (idType === 'integer') {
    if (!INTEGER_ID.test(candidate)) throw new PaginationError('Pagination cursor is invalid');
    const parsed = Number(candidate);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new PaginationError('Pagination cursor is invalid');
    return parsed;
  }
  if (idType === 'uuid' && UUID_ID.test(candidate)) return candidate.toLowerCase();
  throw new PaginationError('Pagination cursor is invalid');
};

export const encodeCursor = ({ createdAt, id }) => Buffer.from(JSON.stringify({
  v: 1,
  createdAt: new Date(createdAt).toISOString(),
  id: String(id),
}), 'utf8').toString('base64url');

export const decodeCursor = (value, { idType }) => {
  if (!value) return null;
  const candidate = String(value);
  if (candidate.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(candidate)) {
    throw new PaginationError('Pagination cursor is invalid');
  }
  try {
    const parsed = JSON.parse(Buffer.from(candidate, 'base64url').toString('utf8'));
    const createdAt = new Date(parsed.createdAt);
    if (parsed.v !== 1 || Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt) {
      throw new PaginationError('Pagination cursor is invalid');
    }
    return { createdAt, id: normalizeId(parsed.id, idType) };
  } catch (error) {
    if (error instanceof PaginationError) throw error;
    throw new PaginationError('Pagination cursor is invalid');
  }
};

export const resolveCursorPagination = (query, {
  defaultLimit,
  maxLimit,
  idType,
}) => ({
  limit: parseLimit(query.limit, defaultLimit, maxLimit),
  cursor: decodeCursor(query.cursor, { idType }),
});

export const cursorWhere = cursor => cursor ? {
  OR: [
    { created_at: { lt: cursor.createdAt } },
    { created_at: cursor.createdAt, id: { lt: cursor.id } },
  ],
} : {};

export const presentPage = (rows, limit) => {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    pagination: {
      limit,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
    },
  };
};
