import {
  buildTenantClaims,
  getIdentityIdFromClaims,
  isUuid,
  tenantUserResponse,
} from './tenantAccess.js';
import { TOKEN_TYPES, issueToken } from './tokenPolicy.js';
import { hasRestaurantAccess } from './subscriptionPolicy.js';

export const createTenantSessionService = ({ db, tokenSecret }) => {
  if (!db) throw new Error('Tenant session database is required');
  if (!tokenSecret) throw new Error('Tenant session token secret is required');

  const resolveTenantSession = async ({ userId, organizationId, branchId }) => {
    if (!isUuid(userId)) return null;

    const membership = await db.organizationUser.findFirst({
      where: {
        user_id: userId,
        status: 'ACTIVE',
        ...(organizationId ? { organization_id: organizationId } : {}),
        user: { active: true },
        organization: { active: true },
      },
      include: {
        user: true,
        organization: true,
        default_branch: true,
      },
      orderBy: { created_at: 'asc' },
    });
    if (!membership) return null;

    // Admin remains the compatibility restaurant profile during the transition.
    // All members of an organization resolve to this same profile/data owner.
    const selectedBranch = db.branch?.findFirst
      ? await db.branch.findFirst({
        where: {
          organization_id: membership.organization_id,
          active: true,
          ...(branchId ? { id: branchId } : {
            id: membership.default_branch_id || undefined,
          }),
        },
      })
      : null;
    // Keep the transition service compatible with legacy test doubles and
    // pre-branch records; production sessions resolve an active branch above.
    if (db.branch?.findFirst && !selectedBranch) return null;

    // The current schema stores a membership default branch, but does not yet
    // have a separate user-to-branch join table. Owners and managers may use
    // any active branch in their organization; staff remain on their assigned
    // default branch until explicit branch grants exist.
    if (branchId && membership.role === 'STAFF' && membership.default_branch_id !== branchId) {
      return null;
    }

    const admin = await db.admin.findFirst({
      where: { organization_id: membership.organization_id },
      orderBy: { created_at: 'asc' },
    });
    if (!hasRestaurantAccess(admin)) return null;

    return {
      membership,
      ...(selectedBranch ? { branch: selectedBranch } : {}),
      user: membership.user,
      organization: membership.organization,
      admin,
    };
  };

  const resolveTenantClaims = claims => resolveTenantSession({
    userId: getIdentityIdFromClaims(claims),
    organizationId: claims?.organizationId,
    branchId: claims?.branchId,
  });

  const issueTenantToken = session => issueToken(
    TOKEN_TYPES.RESTAURANT_SESSION,
    buildTenantClaims(session),
    tokenSecret,
    { subject: session.user.id },
  );

  const tenantResponse = (session, token) => ({
    token,
    user: tenantUserResponse(session),
  });

  return {
    resolveTenantSession,
    resolveTenantClaims,
    issueTenantToken,
    tenantResponse,
  };
};
