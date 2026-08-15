import { verifyAuthToken } from './tokenPolicy.js';

export const createAuthenticate = ({ db, tokenSecret, resolveTenantClaims }) => {
  if (!db) throw new Error('Authentication database is required');
  if (!tokenSecret) throw new Error('Authentication token secret is required');
  if (typeof resolveTenantClaims !== 'function') {
    throw new Error('Tenant claim resolver is required');
  }

  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const cookieToken = String(req.headers.cookie || '')
      .split(';')
      .map(value => value.trim())
      .find(value => value.startsWith('boltqr_superadmin='))
      ?.slice('boltqr_superadmin='.length);
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : cookieToken;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const claims = verifyAuthToken(token, tokenSecret);
      if (!claims?.id && !claims?.sub) {
        return res.status(403).json({ error: 'Invalid token' });
      }

      if (claims.role === 'SUPER_ADMIN') {
        const superAdmin = await db.superAdmin.findUnique({
          where: { id: claims.id },
          select: { id: true, active: true, session_version: true, mfa_enabled_at: true },
        });
        if (!superAdmin?.active || !superAdmin.mfa_enabled_at || claims.mfa !== true
          || !Number.isInteger(claims.sessionVersion)
          || claims.sessionVersion !== superAdmin.session_version) {
          return res.status(403).json({ error: 'Invalid token' });
        }
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

export const requireRecentSuperAdmin = (maxAgeSeconds = 10 * 60, clock = () => Date.now()) =>
  (req, res, next) => {
    const authenticatedAt = Number(req.user?.authTime);
    const ageSeconds = Math.floor(clock() / 1000) - authenticatedAt;
    if (req.user?.role !== 'SUPER_ADMIN' || !Number.isInteger(authenticatedAt)
      || ageSeconds < -60 || ageSeconds > maxAgeSeconds) {
      return res.status(401).json({
        error: 'Recent SuperAdmin authentication is required',
        code: 'SUPER_ADMIN_REAUTH_REQUIRED',
      });
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
