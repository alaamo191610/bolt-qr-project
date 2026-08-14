import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCatalogOwnership,
  createAuthenticate,
  requireOrganizationRole,
  requireSuperAdmin,
} from '../server/accessControl.js';
import { TOKEN_TYPES, issueToken } from '../server/tokenPolicy.js';

const secret = 'access-control-test-secret';
const userId = '11111111-1111-4111-8111-111111111111';
const organizationId = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('authentication maps a restaurant token to current database-backed tenant context', async () => {
  const token = issueToken(TOKEN_TYPES.RESTAURANT_SESSION, {
    id: adminId,
    userId,
    organizationId,
    role: 'RESTAURANT_ADMIN',
  }, secret, { subject: userId });
  const session = {
    user: { id: userId },
    organization: { id: organizationId },
    admin: { id: adminId, default_branch_id: null },
    membership: { role: 'MANAGER', default_branch_id: null },
  };
  const authenticate = createAuthenticate({
    db: { superAdmin: { findUnique: async () => null } },
    tokenSecret: secret,
    resolveTenantClaims: async () => session,
  });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createResponse();
  let nextCalled = false;

  await authenticate(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.auth, {
    userId,
    organizationId,
    branchId: null,
    membershipRole: 'MANAGER',
  });
  assert.equal(req.user.id, adminId);
  assert.equal(req.user.role, 'RESTAURANT_ADMIN');
});

test('authentication rejects missing credentials and inactive tenant access', async () => {
  const authenticate = createAuthenticate({
    db: { superAdmin: { findUnique: async () => null } },
    tokenSecret: secret,
    resolveTenantClaims: async () => null,
  });
  const missingResponse = createResponse();
  await authenticate({ headers: {} }, missingResponse, () => undefined);
  assert.equal(missingResponse.statusCode, 401);

  const token = issueToken(TOKEN_TYPES.RESTAURANT_SESSION, {
    id: adminId,
    userId,
    organizationId,
    role: 'RESTAURANT_ADMIN',
  }, secret, { subject: userId });
  const inactiveResponse = createResponse();
  await authenticate(
    { headers: { authorization: `Bearer ${token}` } },
    inactiveResponse,
    () => undefined,
  );
  assert.equal(inactiveResponse.statusCode, 403);
  assert.equal(inactiveResponse.body.error, 'Tenant access is inactive or unavailable');
});

test('platform and organization role guards deny insufficient roles', () => {
  const platformResponse = createResponse();
  requireSuperAdmin({ user: { role: 'RESTAURANT_ADMIN' } }, platformResponse, () => undefined);
  assert.equal(platformResponse.statusCode, 403);

  const organizationResponse = createResponse();
  requireOrganizationRole('OWNER')(
    { auth: { membershipRole: 'MANAGER' } },
    organizationResponse,
    () => undefined,
  );
  assert.equal(organizationResponse.statusCode, 403);

  let nextCalled = false;
  requireOrganizationRole('OWNER', 'MANAGER')(
    { auth: { membershipRole: 'MANAGER' } },
    createResponse(),
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);
});

test('catalog ownership guard validates category and ingredient ownership together', async () => {
  const db = {
    category: { findFirst: async () => ({ id: 7 }) },
    ingredient: { count: async () => 2 },
  };
  await assertCatalogOwnership(db, adminId, 7, [10, 11]);

  await assert.rejects(
    assertCatalogOwnership({
      category: { findFirst: async () => null },
      ingredient: { count: async () => 0 },
    }, adminId, 99, []),
    error => error?.status === 400 && error.message === 'Invalid category',
  );
  await assert.rejects(
    assertCatalogOwnership({
      category: { findFirst: async () => ({ id: 7 }) },
      ingredient: { count: async () => 1 },
    }, adminId, 7, [10, 11]),
    error => error?.status === 400 && error.message.includes('ingredients'),
  );
});
