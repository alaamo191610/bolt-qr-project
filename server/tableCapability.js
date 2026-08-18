import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ApiError, ERROR_CODES } from './errors.js';
import { TOKEN_TYPES, issueToken, verifyToken } from './tokenPolicy.js';
import { hasRestaurantAccess } from './subscriptionPolicy.js';

export const TABLE_SESSION_EXPIRES_IN_SECONDS = 30 * 60;
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDERABLE_TABLE_STATUSES = new Set(['available', 'occupied']);

export const generateTableCapability = () => randomBytes(32).toString('base64url');

export const hashTableCapability = capability => createHash('sha256')
  .update(String(capability || ''), 'utf8')
  .digest('hex');

export const isTableCapability = capability => typeof capability === 'string'
  && CAPABILITY_PATTERN.test(capability);

const invalidTableSession = () => new ApiError('Table session is invalid or expired', {
  status: 403,
  code: ERROR_CODES.TABLE_SESSION_INVALID,
});

const tableSessionSelection = {
  id: true,
  table_id: true,
  organization_id: true,
  version: true,
  active: true,
  table: {
    select: {
      id: true,
      code: true,
      admin_id: true,
      organization_id: true,
      branch_id: true,
      status: true,
      branch: {
        select: {
          id: true,
          organization_id: true,
          active: true,
          ordering_state: true,
        },
      },
      organization: { select: { id: true, active: true } },
      admin: {
        select: {
          id: true,
          organization_id: true,
          subscription_status: true,
          subscription_end: true,
          trial_ends_at: true,
        },
      },
    },
  },
};

const isUsable = capability => Boolean(
  capability?.active
  && capability.table
  && capability.table.admin
  && capability.table.organization?.active
  && capability.organization_id === capability.table.organization_id
  && capability.organization_id === capability.table.admin.organization_id
  && hasRestaurantAccess(capability.table.admin),
);

const isExchangeable = capability => isUsable(capability)
  && ORDERABLE_TABLE_STATUSES.has(capability.table.status);

export const createTableCapabilityService = ({ db, tokenSecret }) => {
  if (!db) throw new Error('db is required');
  if (!tokenSecret) throw new Error('tokenSecret is required');

  const rotate = async ({ tableId, adminId, organizationId }) => {
    const table = await db.table.findFirst({
      where: { id: Number(tableId), admin_id: adminId, organization_id: organizationId },
      select: { id: true, code: true, organization_id: true },
    });
    if (!table?.organization_id) {
      throw new ApiError('Table not found', { status: 404 });
    }

    const rawCapability = generateTableCapability();
    const secretHash = hashTableCapability(rawCapability);
    const capability = await db.tableCapability.upsert({
      where: { table_id: table.id },
      create: {
        table_id: table.id,
        organization_id: table.organization_id,
        secret_hash: secretHash,
      },
      update: {
        organization_id: table.organization_id,
        secret_hash: secretHash,
        active: true,
        version: { increment: 1 },
        rotated_at: new Date(),
      },
      select: { version: true },
    });

    return {
      capability: rawCapability,
      tableId: table.id,
      tableCode: table.code,
      version: capability.version,
    };
  };

  const revoke = async ({ tableId, adminId, organizationId }) => {
    const table = await db.table.findFirst({
      where: { id: Number(tableId), admin_id: adminId, organization_id: organizationId },
      select: { id: true },
    });
    if (!table) throw new ApiError('Table not found', { status: 404 });

    const current = await db.tableCapability.findUnique({
      where: { table_id: table.id },
      select: { active: true },
    });
    if (current?.active) {
      await db.tableCapability.update({
        where: { table_id: table.id },
        data: { active: false, version: { increment: 1 }, rotated_at: new Date() },
      });
    }
    return { success: true };
  };

  const exchange = async rawCapability => {
    if (!isTableCapability(rawCapability)) throw invalidTableSession();

    const capability = await db.tableCapability.findUnique({
      where: { secret_hash: hashTableCapability(rawCapability) },
      select: tableSessionSelection,
    });
    if (!isExchangeable(capability)) throw invalidTableSession();

    const table = capability.table;
    const sessionId = randomUUID();
    const tableStatusChanged = table.status !== 'occupied';
    if (tableStatusChanged) {
      await db.table.updateMany({
        where: { id: table.id, organization_id: capability.organization_id, status: 'available' },
        data: { status: 'occupied' },
      });
    }
    const token = issueToken(TOKEN_TYPES.TABLE_SESSION, {
      sessionId,
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      tableId: table.id,
      organizationId: capability.organization_id,
      adminId: table.admin_id,
    }, tokenSecret, { subject: capability.id });

    return {
      token,
      expiresIn: TABLE_SESSION_EXPIRES_IN_SECONDS,
      restaurantId: table.admin_id,
      organizationId: capability.organization_id,
      table: { id: table.id, code: table.code },
      tableStatusChanged,
    };
  };

  const resolveSession = async (token, { database = db, lock = false } = {}) => {
    let claims;
    try {
      claims = verifyToken(TOKEN_TYPES.TABLE_SESSION, token, tokenSecret);
    } catch {
      throw invalidTableSession();
    }

    if (
      !UUID_PATTERN.test(String(claims.capabilityId || ''))
      || !UUID_PATTERN.test(String(claims.sessionId || ''))
    ) throw invalidTableSession();
    if (lock) {
      await database.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "table_capabilities"
        WHERE "id" = ${String(claims.capabilityId)}::uuid
        FOR UPDATE
      `);
    }

    const capability = await database.tableCapability.findUnique({
      where: { id: String(claims.capabilityId || '') },
      select: tableSessionSelection,
    });
    if (
      !isUsable(capability)
      || claims.sub !== capability.id
      || Number(claims.capabilityVersion) !== capability.version
      || Number(claims.tableId) !== capability.table_id
      || claims.organizationId !== capability.organization_id
      || claims.adminId !== capability.table.admin_id
    ) {
      throw invalidTableSession();
    }

    return {
      sessionId: String(claims.sessionId),
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      organizationId: capability.organization_id,
      adminId: capability.table.admin_id,
      table: capability.table,
    };
  };

  return { rotate, revoke, exchange, resolveSession };
};
