import {
  buildTenantClaims,
  getIdentityIdFromClaims,
  isUuid,
  tenantUserResponse,
} from './tenantAccess.js';
import { TOKEN_TYPES, issueToken } from './tokenPolicy.js';

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
    if (!admin) return null;

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
