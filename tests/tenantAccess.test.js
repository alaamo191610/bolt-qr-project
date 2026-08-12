import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTenantClaims,
  canAssignOrganizationRole,
  getIdentityIdFromClaims,
  tenantUserResponse,
} from '../server/tenantAccess.js';

const session = {
  admin: { id: 'restaurant-profile', default_branch_id: 'fallback-branch', restaurant_name: 'Restaurant ABC' },
  user: { id: 'login-user', email: 'manager@example.com', name: 'Manager' },
  organization: { id: 'tenant-abc', name: 'Restaurant ABC' },
  membership: { role: 'MANAGER', default_branch_id: 'member-branch' },
};

test('tenant claims separate login identity from the compatibility restaurant ID', () => {
  assert.deepEqual(buildTenantClaims(session), {
    id: 'restaurant-profile',
    userId: 'login-user',
    organizationId: 'tenant-abc',
    branchId: 'member-branch',
    membershipRole: 'MANAGER',
    email: 'manager@example.com',
    role: 'RESTAURANT_ADMIN',
  });
  assert.equal(getIdentityIdFromClaims({ userId: 'new-id', id: 'legacy-id' }), 'new-id');
  assert.equal(getIdentityIdFromClaims({ id: 'legacy-id' }), 'legacy-id');
});

test('tenant user response preserves existing restaurant links while exposing tenant identity', () => {
  assert.deepEqual(tenantUserResponse(session), {
    id: 'restaurant-profile',
    identityId: 'login-user',
    email: 'manager@example.com',
    name: 'Manager',
    organizationId: 'tenant-abc',
    organizationName: 'Restaurant ABC',
    role: 'MANAGER',
  });
});

test('only owners can grant owner membership', () => {
  assert.equal(canAssignOrganizationRole('OWNER', 'OWNER'), true);
  assert.equal(canAssignOrganizationRole('MANAGER', 'MANAGER'), true);
  assert.equal(canAssignOrganizationRole('MANAGER', 'OWNER'), false);
  assert.equal(canAssignOrganizationRole('STAFF', 'INVALID'), false);
});
