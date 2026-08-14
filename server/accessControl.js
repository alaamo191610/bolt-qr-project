import { verifyAuthToken } from './tokenPolicy.js';

export const createAuthenticate = ({ db, tokenSecret, resolveTenantClaims }) => {
  if (!db) throw new Error('Authentication database is required');
  if (!tokenSecret) throw new Error('Authentication token secret is required');
  if (typeof resolveTenantClaims !== 'function') {
    throw new Error('Tenant claim resolver is required');
  }

  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const token = authHeader.slice('Bearer '.length).trim();
      const claims = verifyAuthToken(token, tokenSecret);
      if (!claims?.id && !claims?.sub) {
        return res.status(403).json({ error: 'Invalid token' });
      }

      if (claims.role === 'SUPER_ADMIN') {
        const superAdmin = await db.superAdmin.findUnique({
          where: { id: claims.id },
          select: { id: true },
        });
        if (!superAdmin) return res.status(403).json({ error: 'Invalid token' });
        req.user = claims;
      } else {
        const session = await resolveTenantClaims(claims);
        if (!session) {
          return res.status(403).json({ error: 'Tenant access is inactive or unavailable' });
        }

        req.auth = {
          userId: session.user.id,
          organizationId: session.organization.id,
          branchId: session.membership.default_branch_id || session.admin.default_branch_id || null,
          membershipRole: session.membership.role,
        };
        req.user = {
          ...claims,
          id: session.admin.id,
          userId: session.user.id,
          organizationId: session.organization.id,
          role: 'RESTAURANT_ADMIN',
        };
      }
      next();
    } catch {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
  };
};

export const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super-admin access required' });
  }
  next();
};

export const requireOrganizationRole = (...roles) => (req, res, next) => {
  if (!req.auth?.membershipRole || !roles.includes(req.auth.membershipRole)) {
    return res.status(403).json({ error: 'Insufficient organization permissions' });
  }
  next();
};

export const assertCatalogOwnership = async (db, adminId, categoryId, ingredientIds = []) => {
  if (categoryId !== null && categoryId !== undefined) {
    const category = await db.category.findFirst({
      where: { id: Number(categoryId), admin_id: adminId },
      select: { id: true },
    });
    if (!category) throw Object.assign(new Error('Invalid category'), { status: 400 });
  }

  if (ingredientIds.length) {
    const ownedCount = await db.ingredient.count({
      where: { id: { in: ingredientIds }, admin_id: adminId },
    });
    if (ownedCount !== ingredientIds.length) {
      throw Object.assign(new Error('One or more ingredients are invalid'), { status: 400 });
    }
  }
};
