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

  const resolveTenantSession = async ({ userId, organizationId }) => {
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
    const admin = await db.admin.findFirst({
      where: { organization_id: membership.organization_id },
      orderBy: { created_at: 'asc' },
    });
    if (!hasRestaurantAccess(admin)) return null;

    return {
      membership,
      user: membership.user,
      organization: membership.organization,
      admin,
    };
  };

  const resolveTenantClaims = claims => resolveTenantSession({
    userId: getIdentityIdFromClaims(claims),
    organizationId: claims?.organizationId,
  });

  // resolveTenantSession deliberately fails closed with a bare null, so callers
  // cannot tell "no membership" from "membership fine, subscription lapsed".
  // This answers that question for messaging only. It grants nothing and must
  // only be consulted after a session has already been refused.
  const isSubscriptionLapsed = async ({ userId, organizationId }) => {
    if (!isUuid(userId)) return false;
    const membership = await db.organizationUser.findFirst({
      where: {
        user_id: userId,
        status: 'ACTIVE',
        ...(organizationId ? { organization_id: organizationId } : {}),
        user: { active: true },
        organization: { active: true },
      },
      orderBy: { created_at: 'asc' },
    });
    if (!membership) return false;
    const admin = await db.admin.findFirst({
      where: { organization_id: membership.organization_id },
      orderBy: { created_at: 'asc' },
    });
    return Boolean(admin) && !hasRestaurantAccess(admin);
  };

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
    isSubscriptionLapsed,
    issueTenantToken,
    tenantResponse,
  };
};
