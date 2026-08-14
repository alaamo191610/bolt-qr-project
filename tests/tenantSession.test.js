import test from 'node:test';
import assert from 'node:assert/strict';
import { createTenantSessionService } from '../server/tenantSession.js';
import { TOKEN_TYPES, verifyToken } from '../server/tokenPolicy.js';

const secret = 'tenant-session-test-secret';
const userId = '11111111-1111-4111-8111-111111111111';
const organizationId = '22222222-2222-4222-8222-222222222222';

const membership = {
  organization_id: organizationId,
  default_branch_id: '33333333-3333-4333-8333-333333333333',
  role: 'MANAGER',
  user: { id: userId, email: 'manager@example.com', name: 'Manager' },
  organization: { id: organizationId, name: 'Tenant Restaurant' },
};
const admin = {
  id: '44444444-4444-4444-8444-444444444444',
  organization_id: organizationId,
  default_branch_id: '55555555-5555-4555-8555-555555555555',
  restaurant_name: 'Tenant Restaurant',
};

test('tenant session service resolves active membership and compatibility profile', async () => {
  let membershipQuery;
  let adminQuery;
  const db = {
    organizationUser: {
      findFirst: async query => {
        membershipQuery = query;
        return membership;
      },
    },
    admin: {
      findFirst: async query => {
        adminQuery = query;
        return admin;
      },
    },
  };
  const service = createTenantSessionService({ db, tokenSecret: secret });
  const session = await service.resolveTenantSession({ userId, organizationId });

  assert.deepEqual(session, {
    membership,
    user: membership.user,
    organization: membership.organization,
    admin,
  });
  assert.deepEqual(membershipQuery.where, {
    user_id: userId,
    organization_id: organizationId,
    status: 'ACTIVE',
    user: { active: true },
    organization: { active: true },
  });
  assert.deepEqual(adminQuery.where, { organization_id: organizationId });

  const token = service.issueTenantToken(session);
  const claims = verifyToken(TOKEN_TYPES.RESTAURANT_SESSION, token, secret);
  assert.equal(claims.sub, userId);
  assert.equal(claims.id, admin.id);
  assert.equal(claims.organizationId, organizationId);
  assert.equal(service.tenantResponse(session, token).user.identityId, userId);
});

test('tenant session service rejects invalid identities before database access', async () => {
  let databaseCalled = false;
  const service = createTenantSessionService({
    db: {
      organizationUser: { findFirst: async () => { databaseCalled = true; } },
      admin: { findFirst: async () => { databaseCalled = true; } },
    },
    tokenSecret: secret,
  });

  assert.equal(await service.resolveTenantSession({ userId: 'not-a-uuid' }), null);
  assert.equal(databaseCalled, false);
});

test('tenant claim resolution fails closed when the compatibility profile is unavailable', async () => {
  const service = createTenantSessionService({
    db: {
      organizationUser: { findFirst: async () => membership },
      admin: { findFirst: async () => null },
    },
    tokenSecret: secret,
  });

  assert.equal(await service.resolveTenantClaims({ sub: userId, organizationId }), null);
});
