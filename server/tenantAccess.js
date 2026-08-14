export const ORGANIZATION_ROLES = Object.freeze(['OWNER', 'MANAGER', 'STAFF']);
export const MEMBERSHIP_STATUSES = Object.freeze(['ACTIVE', 'INVITED', 'SUSPENDED']);

export const isUuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const getIdentityIdFromClaims = claims => claims?.userId || claims?.sub || claims?.id || null;

export const buildTenantClaims = session => ({
  id: session.admin.id,
  userId: session.user.id,
  organizationId: session.organization.id,
  branchId: session.membership.default_branch_id || session.admin.default_branch_id || null,
  membershipRole: session.membership.role,
  email: session.user.email,
  role: 'RESTAURANT_ADMIN',
});

export const tenantUserResponse = session => ({
  // Admin.id remains the public restaurant identifier during the transition.
  id: session.admin.id,
  identityId: session.user.id,
  email: session.user.email,
  name: session.user.name || session.admin.restaurant_name,
  organizationId: session.organization.id,
  organizationName: session.organization.name,
  role: session.membership.role,
});

export const canAssignOrganizationRole = (actorRole, requestedRole) =>
  ORGANIZATION_ROLES.includes(requestedRole) && (requestedRole !== 'OWNER' || actorRole === 'OWNER');
