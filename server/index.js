import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import prisma from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { readFile, unlink } from 'fs/promises';
import { ORDER_STATUSES, canTransitionOrder } from './orderTransitions.js';
import {
  MEMBERSHIP_STATUSES,
  ORGANIZATION_ROLES,
  buildTenantClaims,
  canAssignOrganizationRole,
  getIdentityIdFromClaims,
  tenantUserResponse,
} from './tenantAccess.js';

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? null : 'development-only-change-me');

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set(configuredOrigins);
if (process.env.RENDER_EXTERNAL_URL) {
  allowedOrigins.add(process.env.RENDER_EXTERNAL_URL.replace(/\/$/, ''));
}

const isAllowedOrigin = (origin, requestHost) => {
  if (!origin || !isProduction || allowedOrigins.has(origin.replace(/\/$/, ''))) {
    return true;
  }

  if (!requestHost) return false;

  try {
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
};

const isUuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
};

const resolveTenantSession = async ({ userId, organizationId }) => {
  if (!isUuid(userId)) return null;

  const membership = await prisma.organizationUser.findFirst({
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
  const admin = await prisma.admin.findFirst({
    where: { organization_id: membership.organization_id },
    orderBy: { created_at: 'asc' },
  });
  if (!admin) return null;

  return { membership, user: membership.user, organization: membership.organization, admin };
};

const resolveTenantClaims = claims => resolveTenantSession({
  userId: getIdentityIdFromClaims(claims),
  organizationId: claims.organizationId,
});

const issueTenantToken = session => jwt.sign(
  buildTenantClaims(session),
  JWT_SECRET,
  { subject: session.user.id, expiresIn: '24h' },
);

const tenantResponse = (session, token) => ({
  token,
  user: tenantUserResponse(session),
});

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: corsOptions
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-admin', async (payload) => {
    const adminId = typeof payload === 'string' ? payload : payload?.adminId;
    const token = typeof payload === 'object' ? payload?.token : null;

    if (!adminId || !token) return;

    try {
      const claims = jwt.verify(token, JWT_SECRET);
      if (claims.role !== 'RESTAURANT_ADMIN') return;
      const session = await resolveTenantClaims(claims);
      if (!session || session.admin.id !== adminId) return;

      socket.join(`admin_${adminId}`);
      console.log(`Socket ${socket.id} joined admin_${adminId}`);
    } catch {
      // Invalid socket credentials are deliberately ignored.
    }
  });

  socket.on('join-menu', async (adminId) => {
    if (!isUuid(adminId)) return;
    try {
      const admin = await prisma.admin.findUnique({
        where: { id: adminId },
        select: { id: true }
      });
      if (!admin) return;
      socket.join(`menu_${adminId}`);
      console.log(`Socket ${socket.id} joined menu_${adminId}`);
    } catch {
      // Invalid or unavailable restaurant identifiers are ignored.
    }
  });

  socket.on('join-order', (payload) => {
    const orderId = Number(payload?.orderId);
    const trackingToken = payload?.trackingToken;
    if (!Number.isInteger(orderId) || !trackingToken) return;
    try {
      const claims = jwt.verify(trackingToken, JWT_SECRET);
      if (claims.purpose !== 'order-tracking' || Number(claims.orderId) !== orderId) return;
      socket.join(`order_${orderId}`);
      console.log(`Socket ${socket.id} joined order_${orderId}`);
    } catch {
      // Expired or invalid tracking credentials are deliberately ignored.
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
    callback(null, true);
  }
});

const hasImageSignature = (buffer, mimetype) => {
  if (mimetype === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimetype === 'image/gif') return buffer.subarray(0, 4).toString('ascii') === 'GIF8';
  if (mimetype === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
};

app.disable('x-powered-by');
app.use((req, res, next) => {
  const requestHost = req.get('x-forwarded-host') || req.get('host');
  cors({
    ...corsOptions,
    origin(origin, callback) {
      if (isAllowedOrigin(origin, requestHost)) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed by CORS'));
    }
  })(req, res, next);
});
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (isProduction) {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "style-src-attr 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https: wss:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; '));
  }
  if (isProduction && req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use('/uploads', express.static('uploads'));

const rateLimitBuckets = new Map();
const createRateLimiter = ({ windowMs, max }) => (req, res, next) => {
  const now = Date.now();
  const key = `${req.ip}:${req.path}`;
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (current.count >= max) {
    res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  current.count += 1;
  next();
};

const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const orderRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 30 });

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = authHeader.slice('Bearer '.length).trim();
    const claims = jwt.verify(token, JWT_SECRET);
    if (!claims?.id && !claims?.sub) return res.status(403).json({ error: 'Invalid token' });

    if (claims.role === 'SUPER_ADMIN') {
      const superAdmin = await prisma.superAdmin.findUnique({
        where: { id: claims.id },
        select: { id: true }
      });
      if (!superAdmin) return res.status(403).json({ error: 'Invalid token' });
      req.user = claims;
    } else {
      const session = await resolveTenantClaims(claims);
      if (!session) return res.status(403).json({ error: 'Tenant access is inactive or unavailable' });

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

const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super-admin access required' });
  }
  next();
};

const requireOrganizationRole = (...roles) => (req, res, next) => {
  if (!req.auth?.membershipRole || !roles.includes(req.auth.membershipRole)) {
    return res.status(403).json({ error: 'Insufficient organization permissions' });
  }
  next();
};

const normalizeCatalogIds = (values = []) => [...new Set(
  values.map(value => Number(value)).filter(Number.isInteger)
)];

const assertCatalogOwnership = async (db, adminId, categoryId, ingredientIds = []) => {
  if (categoryId !== null && categoryId !== undefined) {
    const category = await db.category.findFirst({
      where: { id: Number(categoryId), admin_id: adminId },
      select: { id: true }
    });
    if (!category) throw Object.assign(new Error('Invalid category'), { status: 400 });
  }

  if (ingredientIds.length) {
    const ownedCount = await db.ingredient.count({
      where: { id: { in: ingredientIds }, admin_id: adminId }
    });
    if (ownedCount !== ingredientIds.length) {
      throw Object.assign(new Error('One or more ingredients are invalid'), { status: 400 });
    }
  }
};

const roundMoney = value => Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2));

const finiteSetting = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

const resolvePromotion = async (db, { adminId, code, subtotal, tableId }) => {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) return null;

  const promotion = await db.promotion.findFirst({
    where: { admin_id: adminId, code: normalizedCode, active: true }
  });
  if (!promotion) throw Object.assign(new Error('Invalid promotion code'), { status: 400 });

  const now = new Date();
  if ((promotion.start_at && promotion.start_at > now) || (promotion.end_at && promotion.end_at < now)) {
    throw Object.assign(new Error('Promotion is not active'), { status: 400 });
  }
  if (promotion.usage_limit !== null && promotion.times_used >= promotion.usage_limit) {
    throw Object.assign(new Error('Promotion usage limit reached'), { status: 400 });
  }
  if (promotion.min_order !== null && subtotal < Number(promotion.min_order)) {
    throw Object.assign(new Error(`Minimum order is ${Number(promotion.min_order).toFixed(2)}`), { status: 400 });
  }
  if (promotion.applies_to === 'table' && (!tableId || promotion.table_id !== tableId)) {
    throw Object.assign(new Error('Promotion is not valid for this table'), { status: 400 });
  }
  return promotion;
};

const calculateOrderTotals = ({ subtotal, promotion, billingSettings, pricingPrefs, type, tipPercent }) => {
  const billing = billingSettings && typeof billingSettings === 'object' ? billingSettings : {};
  const pricing = pricingPrefs && typeof pricingPrefs === 'object' ? pricingPrefs : {};
  const vatPercent = finiteSetting(billing.vatPercent, 0, 0, 100);
  const servicePercent = finiteSetting(billing.serviceChargePercent, 0, 0, 100);
  const configuredDelivery = finiteSetting(billing.deliveryFee, 0, 0, 1000000);
  const safeTipPercent = finiteSetting(tipPercent, 0, 0, 100);

  let discount = 0;
  if (promotion) {
    discount = promotion.type === 'percent'
      ? roundMoney(subtotal * (Number(promotion.value) / 100))
      : roundMoney(Math.min(subtotal, Number(promotion.value)));
  }

  const afterDiscount = roundMoney(Math.max(0, subtotal - discount));
  const serviceCharge = billing.showServiceChargeLine === false
    ? 0
    : roundMoney(afterDiscount * (servicePercent / 100));
  const vatBase = roundMoney(afterDiscount + serviceCharge);
  const taxInclusive = pricing.taxInclusive === true;
  const vat = billing.showVatLine === false || vatPercent === 0
    ? 0
    : taxInclusive
      ? roundMoney(vatBase - (vatBase / (1 + vatPercent / 100)))
      : roundMoney(vatBase * (vatPercent / 100));
  const deliveryFee = type === 'take_away' ? roundMoney(configuredDelivery) : 0;
  const beforeTip = roundMoney(afterDiscount + serviceCharge + deliveryFee + (taxInclusive ? 0 : vat));
  const tip = roundMoney(beforeTip * (safeTipPercent / 100));

  return {
    subtotal: roundMoney(subtotal),
    discount,
    vat,
    serviceCharge,
    deliveryFee,
    tip,
    total: roundMoney(beforeTip + tip)
  };
};

const publicAdminSelect = {
  id: true,
  email: true,
  restaurant_name: true,
  logo_url: true,
  phone: true,
  address: true,
  description: true,
  order_rules: true,
  kds_prefs: true,
  pricing_prefs: true,
  billing_settings: true,
  theme: true,
  theme_mode: true,
  theme_color: true,
  font_family: true,
  preferred_language: true,
  subscription_plan: true,
  subscription_status: true,
  subscription_end: true,
  trial_ends_at: true,
  max_tables: true,
  max_menu_items: true,
  max_staff_accounts: true,
  created_at: true,
};

app.get('/api/health/live', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', database: 'ok' });
  } catch (err) {
    console.error('Readiness check failed:', err);
    res.status(503).json({ status: 'not_ready', database: 'unavailable' });
  }
});

// Backward-compatible health probe for Render and local smoke checks.
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'ok' });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(503).json({ status: 'not_ready' });
  }
});

// --- Auth Routes ---
app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const organizationId = req.body.organizationId ? String(req.body.organizationId) : undefined;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (organizationId && !isUuid(organizationId)) return res.status(400).json({ error: 'Invalid organization' });

  try {
    const identity = await prisma.user.findUnique({ where: { email } });
    if (!identity?.password_hash || !identity.active || !(await bcrypt.compare(password, identity.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const session = await resolveTenantSession({ userId: identity.id, organizationId });
    if (!session) return res.status(403).json({ error: 'No active restaurant membership is available' });

    await prisma.user.update({ where: { id: identity.id }, data: { last_login_at: new Date() } });
    res.json(tenantResponse(session, issueTenantToken(session)));
  } catch (err) {
    console.error('Tenant login failed:', err);
    res.status(500).json({ error: 'Unable to sign in' });
  }
});

app.get('/api/auth/session', authenticate, async (req, res) => {
  if (!req.auth?.userId) return res.status(403).json({ error: 'Restaurant membership required' });
  try {
    const session = await resolveTenantSession({
      userId: req.auth.userId,
      organizationId: req.auth.organizationId,
    });
    if (!session) return res.status(403).json({ error: 'Tenant access is inactive or unavailable' });
    res.json({
      user: tenantResponse(session, null).user,
      profile: {
        id: session.admin.id,
        restaurantName: session.admin.restaurant_name,
        preferredLanguage: session.admin.preferred_language,
      },
    });
  } catch (err) {
    console.error('Session lookup failed:', err);
    res.status(500).json({ error: 'Unable to restore session' });
  }
});

app.get('/api/auth/organizations', authenticate, async (req, res) => {
  if (!req.auth?.userId) return res.status(403).json({ error: 'Restaurant membership required' });
  try {
    const memberships = await prisma.organizationUser.findMany({
      where: { user_id: req.auth.userId, status: 'ACTIVE', organization: { active: true } },
      include: { organization: true, default_branch: true },
      orderBy: { created_at: 'asc' },
    });
    res.json(memberships.map(membership => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
      defaultBranch: membership.default_branch,
      current: membership.organization_id === req.auth.organizationId,
    })));
  } catch (err) {
    console.error('Organization list failed:', err);
    res.status(500).json({ error: 'Unable to load organizations' });
  }
});

app.post('/api/auth/switch-organization', authenticate, async (req, res) => {
  const organizationId = String(req.body.organizationId || '');
  if (!isUuid(organizationId) || !req.auth?.userId) {
    return res.status(400).json({ error: 'Valid organization ID required' });
  }
  try {
    const session = await resolveTenantSession({ userId: req.auth.userId, organizationId });
    if (!session) return res.status(403).json({ error: 'You do not have access to this organization' });
    res.json(tenantResponse(session, issueTenantToken(session)));
  } catch (err) {
    console.error('Organization switch failed:', err);
    res.status(500).json({ error: 'Unable to switch organization' });
  }
});

app.get(
  '/api/organization/members',
  authenticate,
  requireOrganizationRole('OWNER', 'MANAGER'),
  async (req, res) => {
    try {
      const memberships = await prisma.organizationUser.findMany({
        where: { organization_id: req.auth.organizationId },
        include: { user: true, default_branch: true },
        orderBy: { created_at: 'asc' },
      });
      res.json(memberships.map(membership => ({
        userId: membership.user_id,
        email: membership.user.email,
        name: membership.user.name,
        role: membership.role,
        status: membership.status,
        defaultBranch: membership.default_branch,
        createdAt: membership.created_at,
      })));
    } catch (err) {
      console.error('Organization member list failed:', err);
      res.status(500).json({ error: 'Unable to load organization members' });
    }
  },
);

app.post(
  '/api/organization/members',
  authenticate,
  requireOrganizationRole('OWNER', 'MANAGER'),
  async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim() || null;
    const password = String(req.body.password || '');
    const role = String(req.body.role || 'STAFF').toUpperCase();
    if (!email || !ORGANIZATION_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Valid email and role required' });
    }
    if (!canAssignOrganizationRole(req.auth.membershipRole, role)) {
      return res.status(403).json({ error: 'Only an owner can add another owner' });
    }

    try {
      const staffCount = await prisma.organizationUser.count({
        where: {
          organization_id: req.auth.organizationId,
          role: { not: 'OWNER' },
          status: { in: ['ACTIVE', 'INVITED'] },
        },
      });
      const restaurant = await prisma.admin.findFirst({
        where: { organization_id: req.auth.organizationId },
        select: { max_staff_accounts: true, default_branch_id: true },
      });
      if (role !== 'OWNER' && restaurant && staffCount >= restaurant.max_staff_accounts) {
        return res.status(409).json({ error: 'The organization member limit has been reached' });
      }

      const existingIdentity = await prisma.user.findUnique({ where: { email } });
      if (!existingIdentity && password.length < 8) {
        return res.status(400).json({ error: 'A password of at least 8 characters is required for a new user' });
      }

      const membership = await prisma.$transaction(async tx => {
        const identity = existingIdentity || await tx.user.create({
          data: {
            email,
            name,
            password_hash: await bcrypt.hash(password, 10),
          },
        });
        return tx.organizationUser.create({
          data: {
            organization_id: req.auth.organizationId,
            user_id: identity.id,
            default_branch_id: restaurant?.default_branch_id || null,
            role,
            status: 'ACTIVE',
          },
          include: { user: true, default_branch: true },
        });
      });

      res.status(201).json({
        userId: membership.user_id,
        email: membership.user.email,
        name: membership.user.name,
        role: membership.role,
        status: membership.status,
        defaultBranch: membership.default_branch,
      });
    } catch (err) {
      if (err.code === 'P2002') return res.status(409).json({ error: 'This user is already a member' });
      console.error('Organization member creation failed:', err);
      res.status(500).json({ error: 'Unable to add organization member' });
    }
  },
);

app.patch(
  '/api/organization/members/:userId',
  authenticate,
  requireOrganizationRole('OWNER'),
  async (req, res) => {
    const userId = String(req.params.userId || '');
    const role = req.body.role ? String(req.body.role).toUpperCase() : undefined;
    const status = req.body.status ? String(req.body.status).toUpperCase() : undefined;
    if (!isUuid(userId) || (role && !ORGANIZATION_ROLES.includes(role)) ||
      (status && !MEMBERSHIP_STATUSES.includes(status))) {
      return res.status(400).json({ error: 'Invalid membership update' });
    }
    if (userId === req.auth.userId && status === 'SUSPENDED') {
      return res.status(409).json({ error: 'You cannot suspend your own membership' });
    }
    try {
      const updated = await prisma.$transaction(async tx => {
        const current = await tx.organizationUser.findUnique({
          where: {
            organization_id_user_id: {
              organization_id: req.auth.organizationId,
              user_id: userId,
            },
          },
        });
        if (!current) throw Object.assign(new Error('Membership not found'), { status: 404 });
        const removesActiveOwner = current.role === 'OWNER' && current.status === 'ACTIVE' &&
          ((Boolean(role) && role !== 'OWNER') || (Boolean(status) && status !== 'ACTIVE'));
        if (removesActiveOwner) {
          const activeOwnerCount = await tx.organizationUser.count({
            where: { organization_id: req.auth.organizationId, role: 'OWNER', status: 'ACTIVE' },
          });
          if (activeOwnerCount <= 1) {
            throw Object.assign(new Error('An organization must retain at least one active owner'), { status: 409 });
          }
        }
        return tx.organizationUser.update({
          where: {
            organization_id_user_id: {
              organization_id: req.auth.organizationId,
              user_id: userId,
            },
          },
          data: {
            ...(role ? { role } : {}),
            ...(status ? { status } : {}),
          },
          include: { user: true, default_branch: true },
        });
      }, { isolationLevel: 'Serializable' });
      res.json({
        userId: updated.user_id,
        email: updated.user.email,
        name: updated.user.name,
        role: updated.role,
        status: updated.status,
        defaultBranch: updated.default_branch,
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      if (err.code === 'P2025') return res.status(404).json({ error: 'Membership not found' });
      console.error('Organization member update failed:', err);
      res.status(500).json({ error: 'Unable to update organization member' });
    }
  },
);

// --- Menus ---
app.get('/api/menus', authenticate, async (req, res) => {
  try {
    const menus = await prisma.menu.findMany({
      where: { user_id: req.user.id, deleted_at: null },
      orderBy: { created_at: 'desc' },
      include: {
        category: true,
        menu_ingredients: {
          include: { ingredient: true }
        }
      }
    });

    // Map to match frontend structure (category -> categories, menu_ingredients -> ingredients_details)
    const mapped = menus.map(m => ({
      ...m,
      categories: m.category,
      ingredients_details: m.menu_ingredients
    }));

    res.json(mapped);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/menus', authenticate, async (req, res) => {
  const { name_en, name_ar, price, category_id, image_url, available, ingredients } = req.body;
  const user_id = req.user.id; // Get user ID from authenticated token
  try {
    const categoryId = category_id == null ? null : Number(category_id);
    const ingredientIds = normalizeCatalogIds(ingredients);
    if (categoryId !== null && !Number.isInteger(categoryId)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (Array.isArray(ingredients) && ingredientIds.length !== new Set(ingredients.map(Number)).size) {
      return res.status(400).json({ error: 'Invalid ingredient list' });
    }
    await assertCatalogOwnership(prisma, user_id, categoryId, ingredientIds);

    // 🆕 Enforce Menu Item Limit
    const admin = await prisma.admin.findUnique({
      where: { id: user_id },
      select: { max_menu_items: true }
    });

    const currentCount = await prisma.menu.count({
      where: { user_id, deleted_at: null }
    });

    if (admin && currentCount >= admin.max_menu_items) {
      return res.status(403).json({
        error: `Menu item limit reached for your plan (limit: ${admin.max_menu_items}). Please upgrade to add more.`
      });
    }

    const menu = await prisma.menu.create({
      data: {
        name_en, name_ar, price, category_id: categoryId, image_url, available, user_id,
        menu_ingredients: {
          create: ingredientIds.map(id => ({ ingredient_id: id }))
        }
      }
    });
    res.status(201).json(menu);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

app.put('/api/menus/:id', authenticate, async (req, res) => {
  const { name_en, name_ar, price, category_id, image_url, available, ingredients } = req.body;
  const menuId = Number(req.params.id);
  try {
    const ownedMenu = await prisma.menu.findFirst({
      where: { id: menuId, user_id: req.user.id },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });

    const categoryId = category_id === undefined ? undefined : (category_id === null ? null : Number(category_id));
    const ingredientIds = ingredients === undefined ? undefined : normalizeCatalogIds(ingredients);
    if (categoryId !== undefined && categoryId !== null && !Number.isInteger(categoryId)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (ingredients !== undefined && (!Array.isArray(ingredients) || ingredientIds.length !== new Set(ingredients.map(Number)).size)) {
      return res.status(400).json({ error: 'Invalid ingredient list' });
    }
    await assertCatalogOwnership(prisma, req.user.id, categoryId, ingredientIds || []);

    const data = {};
    if (name_en !== undefined) data.name_en = name_en;
    if (name_ar !== undefined) data.name_ar = name_ar;
    if (price !== undefined) data.price = price;
    if (categoryId !== undefined) data.category_id = categoryId;
    if (image_url !== undefined) data.image_url = image_url;
    if (available !== undefined) data.available = available;

    const result = await prisma.$transaction(async (tx) => {
      const menu = await tx.menu.update({
        where: { id: menuId },
        data
      });

      if (ingredientIds !== undefined) {
        // Replace ingredients
        await tx.menuIngredient.deleteMany({ where: { menu_id: menu.id } });
        if (ingredientIds.length > 0) {
          await tx.menuIngredient.createMany({
            data: ingredientIds.map(id => ({ menu_id: menu.id, ingredient_id: id }))
          });
        }
      }
      return menu;
    });

    // Emit real-time update
    io.to(`menu_${req.user.id}`).emit('menu-updated', result);

    res.json(result);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

app.delete('/api/menus/:id', authenticate, async (req, res) => {
  const menuId = Number(req.params.id);
  try {
    const ownedMenu = await prisma.menu.findFirst({
      where: { id: menuId, user_id: req.user.id },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });

    if (req.query.hard === 'true') {
      await prisma.menu.delete({ where: { id: menuId } });
    } else {
      await prisma.menu.update({
        where: { id: menuId },
        data: { deleted_at: new Date() }
      });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/reset-menu', authenticate, async (req, res) => {
  try {
    await prisma.menu.deleteMany({
      where: { user_id: req.user.id }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Advanced Menu Options ---

app.get('/api/menus/:id/options', authenticate, async (req, res) => {
  const menuId = Number(req.params.id);
  try {
    const ownedMenu = await prisma.menu.findFirst({
      where: { id: menuId, user_id: req.user.id },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });

    const [allIngredients, allMenus, menuIngredients, menuModifierGroups, comboGroups] = await Promise.all([
      prisma.ingredient.findMany({
        where: { admin_id: req.user.id },
        orderBy: { name_en: 'asc' }
      }),
      prisma.menu.findMany({
        where: { user_id: req.user.id, deleted_at: null },
        select: { id: true, name_en: true, price: true },
        orderBy: { name_en: 'asc' }
      }),
      prisma.menuIngredient.findMany({ where: { menu_id: menuId } }),
      prisma.menuModifierGroup.findMany({
        where: { menu_id: menuId },
        include: { modifier_group: { include: { modifier_options: true } } }
      }),
      prisma.comboGroup.findMany({
        where: { menu_id: menuId },
        include: { combo_group_items: true }
      })
    ]);
    res.json({ allIngredients, allMenus, menuIngredients, menuModifierGroups, comboGroups });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/menus/:id/ingredients', authenticate, async (req, res) => {
  const menuId = Number(req.params.id);
  const { ingredients } = req.body;
  try {
    const ownedMenu = await prisma.menu.findFirst({
      where: { id: menuId, user_id: req.user.id },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });
    if (!Array.isArray(ingredients)) return res.status(400).json({ error: 'Ingredients must be an array' });
    const ingredientIds = normalizeCatalogIds(ingredients.map(item => item.ingredient_id));
    if (ingredientIds.length !== ingredients.length) {
      return res.status(400).json({ error: 'Invalid ingredient list' });
    }
    await assertCatalogOwnership(prisma, req.user.id, undefined, ingredientIds);

    await prisma.$transaction(async (tx) => {
      await tx.menuIngredient.deleteMany({ where: { menu_id: menuId } });
      if (ingredients?.length) {
        await tx.menuIngredient.createMany({
          data: ingredients.map(i => ({
            menu_id: menuId,
            ingredient_id: Number(i.ingredient_id),
            removable: i.removable,
            extra_available: i.extra_available,
            max_extra: i.max_extra,
            extra_price_override: i.extra_price_override
          }))
        });
      }
    });
    res.json({ success: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

app.post('/api/menus/:id/modifiers', authenticate, async (req, res) => {
  const menuId = Number(req.params.id);
  const { groups } = req.body;
  try {
    const ownedMenu = await prisma.menu.findFirst({
      where: { id: menuId, user_id: req.user.id },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });
    if (!Array.isArray(groups)) return res.status(400).json({ error: 'Modifier groups must be an array' });

    await prisma.$transaction(async (tx) => {
      const currentLinks = await tx.menuModifierGroup.findMany({
        where: { menu_id: menuId },
        select: { group_id: true }
      });
      const editableGroupIds = new Set(currentLinks.map(link => link.group_id));
      const groupIds = [];
      for (const gr of groups) {
        let gid = gr.id ? Number(gr.id) : undefined;
        const data = {
          name_en: gr.name_en,
          name_ar: gr.name_ar,
          selection_type: gr.selection_type,
          min_select: gr.min_select,
          max_select: gr.max_select,
          required: gr.required
        };

        if (gid) {
          if (!editableGroupIds.has(gid)) {
            throw Object.assign(new Error('Modifier group not found'), { status: 404 });
          }
          await tx.modifierGroup.update({ where: { id: gid }, data });
        } else {
          const newG = await tx.modifierGroup.create({ data });
          gid = newG.id;
        }
        groupIds.push(gid);

        await tx.modifierOption.deleteMany({ where: { group_id: gid } });
        if (gr.options?.length) {
          await tx.modifierOption.createMany({
            data: gr.options.map(o => ({
              group_id: gid,
              name_en: o.name_en,
              name_ar: o.name_ar,
              price_delta: o.price_delta,
              max_qty: o.max_qty,
              is_default: o.is_default
            }))
          });
        }
      }

      await tx.menuModifierGroup.deleteMany({ where: { menu_id: menuId } });
      if (groupIds.length) {
        await tx.menuModifierGroup.createMany({
          data: groupIds.map(gid => ({ menu_id: menuId, group_id: gid }))
        });
      }
    });
    res.json({ success: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

app.post('/api/menus/:id/combos', authenticate, async (req, res) => {
  const menuId = Number(req.params.id);
  const { combo } = req.body;
  try {
    const ownedMenu = await prisma.menu.findFirst({
      where: { id: menuId, user_id: req.user.id },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });
    if (!combo || typeof combo !== 'object') return res.status(400).json({ error: 'Combo configuration required' });

    await prisma.$transaction(async (tx) => {
      let groupId = combo.id ? Number(combo.id) : undefined;
      const data = {
        menu_id: menuId,
        min_select: combo.min_select,
        max_select: combo.max_select
      };

      if (groupId) {
        const ownedGroup = await tx.comboGroup.findFirst({
          where: { id: groupId, menu_id: menuId },
          select: { id: true }
        });
        if (!ownedGroup) throw Object.assign(new Error('Combo group not found'), { status: 404 });
        await tx.comboGroup.update({ where: { id: groupId }, data });
      } else {
        const newG = await tx.comboGroup.create({ data });
        groupId = newG.id;
      }

      await tx.comboGroupItem.deleteMany({ where: { group_id: groupId } });
      if (combo.items?.length) {
        const childIds = combo.items
          .filter(i => i.child_menu_id)
          .map(i => Number(i.child_menu_id));
        const ownedChildren = await tx.menu.count({
          where: { id: { in: childIds }, user_id: req.user.id, deleted_at: null }
        });
        if (ownedChildren !== new Set(childIds).size) {
          throw Object.assign(new Error('Combo contains an invalid menu item'), { status: 400 });
        }
        await tx.comboGroupItem.createMany({
          data: combo.items.filter(i => i.child_menu_id).map(i => ({
            group_id: groupId,
            child_menu_id: Number(i.child_menu_id),
            upgrade_price_delta: i.upgrade_price_delta,
            is_default: i.is_default
          }))
        });
      }
    });
    res.json({ success: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// Public endpoint for menu customization configuration
app.get('/api/public/menus/:id/config', async (req, res) => {
  const menuId = Number(req.params.id);
  try {
    const [menu, ingredients, modifierGroups, comboGroups] = await Promise.all([
      prisma.menu.findUnique({
        where: { id: menuId, deleted_at: null },
        include: { category: true }
      }),
      prisma.menuIngredient.findMany({
        where: { menu_id: menuId },
        include: { ingredient: true }
      }),
      prisma.menuModifierGroup.findMany({
        where: { menu_id: menuId },
        include: {
          modifier_group: {
            include: {
              modifier_options: true
            }
          }
        }
      }),
      prisma.comboGroup.findMany({
        where: { menu_id: menuId },
        include: {
          combo_group_items: {
            include: {
              menus: {
                select: { id: true, name_en: true, price: true }
              }
            }
          }
        }
      })
    ]);

    if (!menu) return res.status(404).json({ error: 'Menu item not found' });

    res.json({
      menu,
      ingredients,
      modifierGroups,
      comboGroups
    });
  } catch (err) {
    console.error('Error fetching menu config:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Categories & Ingredients ---
app.get('/api/categories', authenticate, async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { admin_id: req.user.id },
    orderBy: { name_en: 'asc' }
  });
  res.json(categories);
});

app.post('/api/categories', authenticate, async (req, res) => {
  const name_en = String(req.body.name_en || '').trim();
  const name_ar = req.body.name_ar ? String(req.body.name_ar).trim() : null;
  if (!name_en) return res.status(400).json({ error: 'English category name is required' });
  try {
    const category = await prisma.category.create({
      data: { admin_id: req.user.id, name_en, name_ar }
    });
    res.status(201).json(category);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Category already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ingredients', authenticate, async (req, res) => {
  const ingredients = await prisma.ingredient.findMany({
    where: { admin_id: req.user.id },
    orderBy: { name_en: 'asc' }
  });
  res.json(ingredients);
});

app.post('/api/ingredients', authenticate, async (req, res) => {
  const name_en = String(req.body.name_en || '').trim();
  const name_ar = req.body.name_ar ? String(req.body.name_ar).trim() : null;
  if (!name_en) return res.status(400).json({ error: 'English ingredient name is required' });
  try {
    const ingredient = await prisma.ingredient.create({
      data: { admin_id: req.user.id, name_en, name_ar }
    });
    res.status(201).json(ingredient);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ingredient already exists' });
    res.status(500).json({ error: err.message });
  }
});

// --- Orders ---
app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { admin_id: req.user.id },
      orderBy: { created_at: 'desc' },
      include: {
        table: true,
        order_items: {
          include: { menu: true }
        }
      }
    });

    const ingredientIds = new Set();
    const optionIds = new Set();
    const comboMenuIds = new Set();
    for (const order of orders) {
      for (const item of order.order_items) {
        const customizations = item.customizations && typeof item.customizations === 'object' ? item.customizations : {};
        for (const selection of Array.isArray(customizations.ingredients) ? customizations.ingredients : []) {
          if (Number.isInteger(Number(selection.ingredientId))) ingredientIds.add(Number(selection.ingredientId));
        }
        for (const selection of Array.isArray(customizations.options) ? customizations.options : []) {
          if (Number.isInteger(Number(selection.optionId))) optionIds.add(Number(selection.optionId));
        }
        for (const selection of Array.isArray(customizations.comboChildren) ? customizations.comboChildren : []) {
          if (Number.isInteger(Number(selection.childMenuId))) comboMenuIds.add(Number(selection.childMenuId));
        }
      }
    }

    const [ingredients, options, comboMenus] = await Promise.all([
      ingredientIds.size ? prisma.ingredient.findMany({
        where: { id: { in: [...ingredientIds] }, admin_id: req.user.id },
        select: { id: true, name_en: true, name_ar: true },
      }) : [],
      optionIds.size ? prisma.modifierOption.findMany({
        where: { id: { in: [...optionIds] } },
        select: { id: true, name_en: true, name_ar: true },
      }) : [],
      comboMenuIds.size ? prisma.menu.findMany({
        where: { id: { in: [...comboMenuIds] }, user_id: req.user.id },
        select: { id: true, name_en: true, name_ar: true },
      }) : [],
    ]);
    const ingredientMap = new Map(ingredients.map(item => [item.id, item]));
    const optionMap = new Map(options.map(item => [item.id, item]));
    const comboMenuMap = new Map(comboMenus.map(item => [item.id, item]));

    res.json(orders.map(order => ({
      ...order,
      order_items: order.order_items.map(item => {
        const customizations = item.customizations && typeof item.customizations === 'object' ? item.customizations : {};
        return {
          ...item,
          customization_details: {
            ingredients: (Array.isArray(customizations.ingredients) ? customizations.ingredients : []).map(selection => ({
              ...selection,
              name_en: ingredientMap.get(Number(selection.ingredientId))?.name_en || 'Ingredient',
              name_ar: ingredientMap.get(Number(selection.ingredientId))?.name_ar || null,
            })),
            options: (Array.isArray(customizations.options) ? customizations.options : []).map(selection => ({
              ...selection,
              name_en: optionMap.get(Number(selection.optionId))?.name_en || 'Option',
              name_ar: optionMap.get(Number(selection.optionId))?.name_ar || null,
            })),
            comboChildren: (Array.isArray(customizations.comboChildren) ? customizations.comboChildren : []).map(selection => ({
              ...selection,
              name_en: comboMenuMap.get(Number(selection.childMenuId))?.name_en || 'Combo item',
              name_ar: comboMenuMap.get(Number(selection.childMenuId))?.name_ar || null,
            })),
          },
        };
      }),
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/orders', orderRateLimit, async (req, res) => {
  const { tableCode, items, adminId, type, promotionCode, tipPercent } = req.body;

  if (!adminId) return res.status(400).json({ error: 'Restaurant ID required' });
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    return res.status(400).json({ error: 'Order must contain between 1 and 100 items' });
  }
  if (!['dine_in', 'take_away'].includes(type)) {
    return res.status(400).json({ error: 'Invalid order type' });
  }
  if (type === 'dine_in' && !tableCode) {
    return res.status(400).json({ error: 'Table code required for dine-in orders' });
  }
  if (!Number.isFinite(Number(tipPercent ?? 0)) || Number(tipPercent ?? 0) < 0 || Number(tipPercent ?? 0) > 100) {
    return res.status(400).json({ error: 'Invalid tip percentage' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const targetAdmin = await tx.admin.findUnique({
        where: { id: adminId },
        select: {
          id: true,
          subscription_status: true,
          billing_settings: true,
          pricing_prefs: true
        }
      });
      if (!targetAdmin || !['ACTIVE', 'TRIAL'].includes(targetAdmin.subscription_status)) {
        throw Object.assign(new Error('Restaurant is not accepting orders'), { status: 403 });
      }

      let table = null;
      if (tableCode) {
        table = await tx.table.findFirst({
          where: {
            admin_id: adminId,
            code: { equals: String(tableCode), mode: 'insensitive' }
          }
        });
      }
      if (!table && type === 'dine_in') {
        throw Object.assign(new Error('Table not found'), { status: 404 });
      }

      const normalizedItems = items.map(item => {
        if (item.ingredients !== undefined && !Array.isArray(item.ingredients)) {
          throw Object.assign(new Error('Invalid ingredient selections'), { status: 400 });
        }
        if (item.options !== undefined && !Array.isArray(item.options)) {
          throw Object.assign(new Error('Invalid modifier selections'), { status: 400 });
        }
        if (item.comboChildren !== undefined && !Array.isArray(item.comboChildren)) {
          throw Object.assign(new Error('Invalid combo selections'), { status: 400 });
        }
        return {
          menuId: Number(item.menuId),
          quantity: Number(item.quantity),
          notes: item.notes == null ? null : String(item.notes).trim().slice(0, 500),
          ingredients: (item.ingredients || []).flat().map(selection => ({
            ingredientId: Number(selection.ingredientId),
            action: selection.action,
            qty: Number(selection.qty || 1)
          })),
          options: (item.options || []).flat().map(selection => ({
            optionId: Number(selection.optionId),
            qty: Number(selection.qty || 1)
          })),
          comboChildren: (item.comboChildren || []).flat().map(selection => ({
            groupId: selection.groupId == null ? null : Number(selection.groupId),
            childMenuId: Number(selection.childMenuId)
          }))
        };
      });

      if (normalizedItems.some(item =>
        !Number.isInteger(item.menuId) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99
      )) {
        throw Object.assign(new Error('Invalid menu item or quantity'), { status: 400 });
      }

      const menuIds = [...new Set(normalizedItems.map(item => item.menuId))];
      const [menuItemsFromDb, ingredientConfigs, modifierLinks, comboGroups] = await Promise.all([
        tx.menu.findMany({
          where: { id: { in: menuIds }, user_id: adminId, deleted_at: null, available: true }
        }),
        tx.menuIngredient.findMany({ where: { menu_id: { in: menuIds } } }),
        tx.menuModifierGroup.findMany({
          where: { menu_id: { in: menuIds } },
          include: { modifier_group: { include: { modifier_options: true } } }
        }),
        tx.comboGroup.findMany({
          where: { menu_id: { in: menuIds } },
          include: {
            combo_group_items: {
              include: {
                menus: {
                  select: { id: true, user_id: true, available: true, deleted_at: true }
                }
              }
            }
          }
        })
      ]);

      if (menuItemsFromDb.length !== menuIds.length) {
        throw Object.assign(new Error('One or more menu items are unavailable'), { status: 400 });
      }

      const priceMap = new Map(menuItemsFromDb.map(item => [item.id, Number(item.price)]));
      const ingredientMap = new Map(ingredientConfigs.map(config => [
        `${config.menu_id}:${config.ingredient_id}`,
        config
      ]));
      const modifierGroupsByMenu = new Map();
      for (const link of modifierLinks) {
        const groups = modifierGroupsByMenu.get(link.menu_id) || [];
        groups.push(link.modifier_group);
        modifierGroupsByMenu.set(link.menu_id, groups);
      }
      const comboGroupsByMenu = new Map();
      for (const group of comboGroups) {
        const groups = comboGroupsByMenu.get(group.menu_id) || [];
        groups.push(group);
        comboGroupsByMenu.set(group.menu_id, groups);
      }

      let subtotal = 0;
      const orderItemsData = normalizedItems.map(item => {
        const ingredientIds = item.ingredients.map(selection => selection.ingredientId);
        if (ingredientIds.some(id => !Number.isInteger(id)) || new Set(ingredientIds).size !== ingredientIds.length) {
          throw Object.assign(new Error('Invalid ingredient customization'), { status: 400 });
        }

        let ingredientDelta = 0;
        for (const selection of item.ingredients) {
          const configured = ingredientMap.get(`${item.menuId}:${selection.ingredientId}`);
          if (!configured || !['remove', 'extra'].includes(selection.action)) {
            throw Object.assign(new Error('Invalid ingredient customization'), { status: 400 });
          }
          if (selection.action === 'remove' && !configured.removable) {
            throw Object.assign(new Error('Ingredient cannot be removed'), { status: 400 });
          }
          if (selection.action === 'extra') {
            if (
              !configured.extra_available ||
              !Number.isInteger(selection.qty) ||
              selection.qty < 1 ||
              selection.qty > configured.max_extra
            ) {
              throw Object.assign(new Error('Invalid ingredient quantity'), { status: 400 });
            }
            ingredientDelta += Number(configured.extra_price_override || 0) * selection.qty;
          }
        }

        const linkedModifierGroups = modifierGroupsByMenu.get(item.menuId) || [];
        const optionIds = item.options.map(selection => selection.optionId);
        if (optionIds.some(id => !Number.isInteger(id)) || new Set(optionIds).size !== optionIds.length) {
          throw Object.assign(new Error('Invalid modifier selection'), { status: 400 });
        }
        const optionToGroup = new Map();
        for (const group of linkedModifierGroups) {
          for (const option of group.modifier_options) optionToGroup.set(option.id, { option, group });
        }
        const selectionsByGroup = new Map();
        let modifierDelta = 0;
        for (const selection of item.options) {
          const configured = optionToGroup.get(selection.optionId);
          if (
            !configured ||
            !Number.isInteger(selection.qty) ||
            selection.qty < 1 ||
            selection.qty > Number(configured.option.max_qty || 1) ||
            (configured.group.selection_type === 'single' && selection.qty !== 1)
          ) {
            throw Object.assign(new Error('Invalid modifier selection'), { status: 400 });
          }
          const groupSelections = selectionsByGroup.get(configured.group.id) || [];
          groupSelections.push(selection);
          selectionsByGroup.set(configured.group.id, groupSelections);
          modifierDelta += Number(configured.option.price_delta || 0) * selection.qty;
        }
        for (const group of linkedModifierGroups) {
          const selectedCount = (selectionsByGroup.get(group.id) || []).length;
          const minimum = Math.max(Number(group.min_select || 0), group.required ? 1 : 0);
          const maximum = group.selection_type === 'single' ? 1 : Number(group.max_select || 99);
          if (selectedCount < minimum || selectedCount > maximum) {
            throw Object.assign(new Error(`Invalid selection for ${group.name_en}`), { status: 400 });
          }
        }

        const linkedComboGroups = comboGroupsByMenu.get(item.menuId) || [];
        const comboSelectionsByGroup = new Map();
        let comboDelta = 0;
        for (const selection of item.comboChildren) {
          if (!Number.isInteger(selection.childMenuId)) {
            throw Object.assign(new Error('Invalid combo selection'), { status: 400 });
          }
          const candidateGroups = linkedComboGroups.filter(group =>
            (selection.groupId === null || group.id === selection.groupId) &&
            group.combo_group_items.some(groupItem => groupItem.child_menu_id === selection.childMenuId)
          );
          if (candidateGroups.length !== 1) {
            throw Object.assign(new Error('Invalid combo selection'), { status: 400 });
          }
          const group = candidateGroups[0];
          const configured = group.combo_group_items.find(groupItem => groupItem.child_menu_id === selection.childMenuId);
          if (
            !configured?.menus ||
            configured.menus.user_id !== adminId ||
            configured.menus.available !== true ||
            configured.menus.deleted_at !== null
          ) {
            throw Object.assign(new Error('Combo item is unavailable'), { status: 400 });
          }
          const groupSelections = comboSelectionsByGroup.get(group.id) || [];
          if (groupSelections.some(existing => existing.childMenuId === selection.childMenuId)) {
            throw Object.assign(new Error('Duplicate combo selection'), { status: 400 });
          }
          groupSelections.push(selection);
          comboSelectionsByGroup.set(group.id, groupSelections);
          comboDelta += Number(configured.upgrade_price_delta || 0);
        }
        for (const group of linkedComboGroups) {
          const selectedCount = (comboSelectionsByGroup.get(group.id) || []).length;
          if (selectedCount < Number(group.min_select || 0) || selectedCount > Number(group.max_select || 1)) {
            throw Object.assign(new Error('Invalid combo selection count'), { status: 400 });
          }
        }

        const unitPrice = roundMoney(priceMap.get(item.menuId) + ingredientDelta + modifierDelta + comboDelta);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          throw Object.assign(new Error(`Invalid price for menu item ${item.menuId}`), { status: 400 });
        }
        subtotal += unitPrice * item.quantity;
        return {
          menu_id: item.menuId,
          quantity: item.quantity,
          price_at_order: unitPrice,
          note: item.notes,
          customizations: {
            ingredients: item.ingredients,
            options: item.options,
            comboChildren: item.comboChildren
          }
        };
      });

      subtotal = roundMoney(subtotal);
      const promotion = await resolvePromotion(tx, {
        adminId,
        code: promotionCode,
        subtotal,
        tableId: table?.id || null
      });
      const totals = calculateOrderTotals({
        subtotal,
        promotion,
        billingSettings: targetAdmin.billing_settings,
        pricingPrefs: targetAdmin.pricing_prefs,
        type,
        tipPercent: Number(tipPercent || 0)
      });

      const orderData = {
        total: totals.total,
        subtotal: totals.subtotal,
        discount: totals.discount,
        vat: totals.vat,
        service_charge: totals.serviceCharge,
        delivery_fee: totals.deliveryFee,
        tip: totals.tip,
        promotion_code: promotion?.code || null,
        status: 'pending',
        type,
        admin: { connect: { id: adminId } }
      };
      if (table) orderData.table = { connect: { id: table.id } };
      if (promotion) orderData.promotion = { connect: { id: promotion.id } };

      const order = await tx.order.create({ data: orderData });
      await tx.orderItem.createMany({
        data: orderItemsData.map(itemData => ({ ...itemData, order_id: order.id }))
      });

      if (promotion) {
        const promotionUpdate = await tx.promotion.updateMany({
          where: {
            id: promotion.id,
            OR: [
              { usage_limit: null },
              { times_used: { lt: promotion.usage_limit ?? 0 } }
            ]
          },
          data: { times_used: { increment: 1 } }
        });
        if (promotionUpdate.count !== 1) {
          throw Object.assign(new Error('Promotion usage limit reached'), { status: 400 });
        }
      }
      if (table && table.status !== 'occupied') {
        await tx.table.update({ where: { id: table.id }, data: { status: 'occupied' } });
      }
      return order;
    });

    // Emit real-time update to the admin and return the complete order.
    let fullOrder = result;
    if (result && result.admin_id) {
      fullOrder = await prisma.order.findUnique({
        where: { id: result.id },
        include: {
          table: true,
          order_items: { include: { menu: true } }
        }
      });
      io.to(`admin_${result.admin_id}`).emit('new-order', fullOrder);
      if (fullOrder?.table) {
        io.to(`admin_${result.admin_id}`).emit('table-updated', {
          ...fullOrder.table,
          status: 'occupied'
        });
      }
    }

    const trackingToken = jwt.sign({
      purpose: 'order-tracking',
      orderId: fullOrder.id,
      adminId: fullOrder.admin_id,
    }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ ...fullOrder, tracking_token: trackingToken });
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/public/orders/:id/status', async (req, res) => {
  const orderId = Number(req.params.id);
  const authorization = String(req.headers.authorization || '');
  const trackingToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!Number.isInteger(orderId) || !trackingToken) {
    return res.status(400).json({ error: 'Order tracking credentials are required' });
  }

  try {
    const claims = jwt.verify(trackingToken, JWT_SECRET);
    if (claims.purpose !== 'order-tracking' || Number(claims.orderId) !== orderId) {
      return res.status(403).json({ error: 'Invalid order tracking credentials' });
    }
    const order = await prisma.order.findFirst({
      where: { id: orderId, admin_id: claims.adminId },
      select: { id: true, status: true, updated_at: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch {
    res.status(401).json({ error: 'Order tracking session expired' });
  }
});

app.put('/api/orders/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;
  if (!ORDER_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid order status' });
  try {
    const order = await prisma.$transaction(async tx => {
      const current = await tx.order.findFirst({
        where: { id: Number(req.params.id), admin_id: req.user.id },
        select: { id: true, status: true, version: true }
      });
      if (!current) throw Object.assign(new Error('Order not found'), { status: 404 });
      if (current.status === status) return tx.order.findUnique({ where: { id: current.id } });
      if (!canTransitionOrder(current.status, status)) {
        throw Object.assign(new Error(`Cannot move order from ${current.status} to ${status}`), { status: 409 });
      }

      const updated = await tx.order.updateMany({
        where: { id: current.id, admin_id: req.user.id, version: current.version },
        data: { status, version: { increment: 1 } }
      });
      if (updated.count !== 1) throw Object.assign(new Error('Order changed; refresh and retry'), { status: 409 });
      return tx.order.findUnique({ where: { id: current.id } });
    }, { isolationLevel: 'Serializable' });

    let releasedTable = null;
    if (order.table_id && ['served', 'cancelled'].includes(status)) {
      const activeOrders = await prisma.order.count({
        where: {
          table_id: order.table_id,
          id: { not: order.id },
          status: { in: ['pending', 'preparing', 'ready'] }
        }
      });
      if (activeOrders === 0) {
        releasedTable = await prisma.table.update({
          where: { id: order.table_id },
          data: { status: 'available' }
        });
      }
    }
    // Emit to customer tracking this order
    io.to(`order_${order.id}`).emit('order-status-updated', { status });
    // Emit to admin dashboard
    if (order.admin_id) {
      io.to(`admin_${order.admin_id}`).emit('order-updated', order);
      if (releasedTable) {
        io.to(`admin_${order.admin_id}`).emit('table-updated', releasedTable);
      }
    }
    res.json(order);
  } catch (err) { res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' }); }
});

// --- Tables ---
app.get('/api/tables', authenticate, async (req, res) => {
  const tables = await prisma.table.findMany({
    where: { admin_id: req.user.id },
    orderBy: { created_at: 'asc' }
  });
  res.json(tables);
});

app.post('/api/tables', authenticate, async (req, res) => {
  const { code, number, capacity } = req.body;
  const admin_id = req.user.id; // Get user ID from authenticated token
  // Handle frontend sending 'number' instead of 'code'
  const tableCode = code || number;

  try {
    // 🆕 Enforce Table Limit
    const admin = await prisma.admin.findUnique({
      where: { id: admin_id },
      select: { max_tables: true }
    });

    const currentCount = await prisma.table.count({
      where: { admin_id }
    });

    if (admin && currentCount >= admin.max_tables) {
      return res.status(403).json({
        error: `Table limit reached for your plan (limit: ${admin.max_tables}). Please upgrade to add more.`
      });
    }

    const table = await prisma.table.create({
      data: { code: tableCode, capacity: Number(capacity), admin_id }
    });
    res.json(table);
  } catch (err) {
    console.error('Error creating table:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tables/:id', authenticate, async (req, res) => {
  const { code, capacity, status } = req.body;
  try {
    const ownedTable = await prisma.table.findFirst({
      where: { id: Number(req.params.id), admin_id: req.user.id },
      select: { id: true }
    });
    if (!ownedTable) return res.status(404).json({ error: 'Table not found' });

    const table = await prisma.table.update({
      where: { id: Number(req.params.id) },
      data: { code, capacity: Number(capacity), status }
    });
    res.json(table);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tables/:id', authenticate, async (req, res) => {
  try {
    const tableId = Number(req.params.id);
    const table = await prisma.table.findUnique({ where: { id: tableId } });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    if (table.admin_id !== req.user.id) {
      return res.status(404).json({ error: 'Table not found' });
    }

    if (table.status === 'occupied') {
      return res.status(400).json({ error: 'Cannot delete an occupied table' });
    }

    await prisma.table.delete({ where: { id: tableId } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public endpoint for QR code access (No auth required)
app.get('/api/tables/public/:code', async (req, res) => {
  try {
    const tables = await prisma.table.findMany({
      where: {
        ...(req.query.adminId ? { admin_id: req.query.adminId } : {}),
        code: {
          equals: req.params.code,
          mode: 'insensitive'
        }
      },
      take: 2
    });
    if (tables.length > 1) {
      return res.status(409).json({ error: 'Ambiguous table code. Please scan a current QR code.' });
    }
    const table = tables[0];
    if (!table) return res.status(404).json({ error: 'Table not found' });
    res.json(table);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🆕 Public endpoint for customer pricing settings (No auth required)
// Customers access this via table code from QR code URL
app.get('/api/public/pricing', async (req, res) => {
  try {
    const tableCode = req.query.table;
    const adminId = req.query.adminId;
    if (!tableCode) {
      return res.status(400).json({ error: 'Table code required' });
    }
    if (adminId && !isUuid(adminId)) {
      return res.status(400).json({ error: 'Invalid restaurant ID' });
    }

    // Find table and get admin
    const tables = await prisma.table.findMany({
      where: {
        ...(adminId ? { admin_id: adminId } : {}),
        code: {
          equals: tableCode,
          mode: 'insensitive'
        }
      },
      select: { id: true, admin_id: true, status: true },
      take: 2
    });
    if (tables.length > 1) {
      return res.status(409).json({ error: 'Ambiguous table code. Please scan a current QR code.' });
    }
    const table = tables[0];

    if (!table || !table.admin_id) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Get admin's pricing and billing settings
    const admin = await prisma.admin.findUnique({
      where: { id: table.admin_id },
      select: {
        id: true,
        restaurant_name: true,  // 🆕 For customer menu header
        logo_url: true,          // 🆕 For customer menu header  
        pricing_prefs: true,
        billing_settings: true
      }
    });

    if (!admin) {
      return res.status(404).json({ error: 'Restaurant settings not found' });
    }

    res.json(admin);
  } catch (err) {
    console.error('Public pricing error:', err);
    res.status(500).json({ error: 'Unable to load pricing settings' });
  }
});

app.get('/api/public/promotions/validate', orderRateLimit, async (req, res) => {
  const adminId = String(req.query.adminId || '');
  const code = String(req.query.code || '');
  const subtotal = Number(req.query.subtotal || 0);
  const tableCode = req.query.table ? String(req.query.table) : null;
  if (!adminId || !code || !Number.isFinite(subtotal) || subtotal < 0) {
    return res.status(400).json({ error: 'Restaurant, promotion code, and subtotal are required' });
  }

  try {
    const restaurant = await prisma.admin.findFirst({
      where: { id: adminId, subscription_status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true }
    });
    if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

    const table = tableCode
      ? await prisma.table.findFirst({
          where: { admin_id: adminId, code: { equals: tableCode, mode: 'insensitive' } },
          select: { id: true }
        })
      : null;
    const promotion = await resolvePromotion(prisma, {
      adminId,
      code,
      subtotal: roundMoney(subtotal),
      tableId: table?.id || null
    });

    res.json({
      id: promotion.id,
      admin_id: promotion.admin_id,
      code: promotion.code,
      type: promotion.type,
      value: Number(promotion.value),
      min_order: promotion.min_order === null ? null : Number(promotion.min_order),
      start_at: promotion.start_at,
      end_at: promotion.end_at,
      usage_limit: promotion.usage_limit,
      times_used: promotion.times_used,
      active: promotion.active,
      applies_to: promotion.applies_to,
      table_id: promotion.table_id
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// 🆕 Public endpoint for customer menu (No auth required)
app.get('/api/public/menus', async (req, res) => {
  const adminId = req.query.adminId;
  if (!isUuid(adminId)) {
    return res.status(400).json({ error: 'Admin ID required' });
  }

  try {
    const menus = await prisma.menu.findMany({
      where: {
        user_id: adminId,
        deleted_at: null
      },
      orderBy: { created_at: 'desc' },
      include: {
        category: true,
        menu_ingredients: {
          include: { ingredient: true }
        },
        menu_modifier_groups: true // Include this to check for modifiers
      }
    });

    const mapped = menus.map(m => ({
      ...m,
      categories: m.category,
      ingredients_details: m.menu_ingredients,
      // Dynamically compute has_modifiers since the DB field might be stale
      has_modifiers: (m.menu_modifier_groups && m.menu_modifier_groups.length > 0) || m.has_modifiers
    }));

    // Preserve existing records while preventing duplicate catalog rows from
    // being shown to customers. The newest row wins without deleting data.
    const seenCatalogItems = new Set();
    const deduplicated = mapped.filter(item => {
      const key = `${item.category_id ?? 'uncategorized'}:${String(item.name_en).trim().toLowerCase()}:${item.price}`;
      if (seenCatalogItems.has(key)) return false;
      seenCatalogItems.add(key);
      return true;
    });

    res.json(deduplicated);
  } catch (err) {
    console.error('Public menu error:', err);
    res.status(500).json({ error: 'Unable to load the menu' });
  }
});

// --- Admin ---
app.get('/api/admin/profile', authenticate, async (req, res) => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: req.user.id },
      select: publicAdminSelect
    });
    res.json(admin);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- User Management (Super Admin) ---
app.get('/api/admins', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const admins = await prisma.admin.findMany({
      orderBy: { created_at: 'desc' },
      select: publicAdminSelect
    });
    res.json(admins);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admins', authRateLimit, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const restaurantName = String(req.body.restaurant_name || '').trim() || email.split('@')[0] || 'Restaurant';
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const [existingIdentity, existingAdmin] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      prisma.admin.findUnique({ where: { email }, select: { id: true } }),
    ]);
    if (existingIdentity || existingAdmin) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await prisma.$transaction(async tx => {
      const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
      const slugBase = restaurantName
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'restaurant';
      const organization = await tx.organization.create({
        data: { name: restaurantName, slug: `${slugBase}-${suffix}` },
      });
      const branch = await tx.branch.create({
        data: {
          organization_id: organization.id,
          code: 'MAIN',
          name: 'Main Branch',
          timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Amman',
          currency: process.env.DEFAULT_CURRENCY || 'JOD',
        },
      });
      const identity = await tx.user.create({
        data: { email, password_hash: hashedPassword, name: restaurantName },
      });
      await tx.organizationUser.create({
        data: {
          organization_id: organization.id,
          user_id: identity.id,
          default_branch_id: branch.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
      const admin = await tx.admin.create({
        data: {
          organization_id: organization.id,
          default_branch_id: branch.id,
          email,
          // Transitional copy; User.password_hash is now authoritative.
          password: hashedPassword,
          restaurant_name: restaurantName,
        },
        select: publicAdminSelect,
      });
      return { admin, organization, identity };
    });
    res.status(201).json({
      ...result.admin,
      identity_id: result.identity.id,
      organization_id: result.organization.id,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admins/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.admin.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/profile', authenticate, async (req, res) => {
  const allowedFields = [
    'restaurant_name', 'logo_url', 'phone', 'address', 'description', 'preferred_language'
  ];
  const updates = Object.fromEntries(
    allowedFields
      .filter(field => req.body[field] !== undefined)
      .map(field => [field, req.body[field]])
  );
  try {
    const admin = await prisma.admin.update({
      where: { id: req.user.id },
      data: updates,
      select: publicAdminSelect
    });
    res.json(admin);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/analytics', authenticate, async (req, res) => {
  const { days } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (Number(days) || 30));

  try {
    const orders = await prisma.order.findMany({
      where: {
        admin_id: req.user.id,
        created_at: { gte: startDate }
      },
      orderBy: { created_at: 'desc' },
      include: {
        order_items: {
          include: { menu: true }
        }
      }
    });
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/monetary', authenticate, async (req, res) => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        restaurant_name: true,
        logo_url: true,
        pricing_prefs: true,
        billing_settings: true,
      }
    });
    res.json(admin);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/pricing', authenticate, async (req, res) => {
  const { pricing_prefs } = req.body;
  const allowedCurrencies = new Set(['USD', 'QAR', 'JOD', 'SAR']);
  if (!pricing_prefs || typeof pricing_prefs !== 'object' || !allowedCurrencies.has(pricing_prefs.baseCurrency)) {
    return res.status(400).json({ error: 'Invalid pricing preferences' });
  }
  if (
    !Array.isArray(pricing_prefs.enabledCurrencies) ||
    pricing_prefs.enabledCurrencies.some(currency => !allowedCurrencies.has(currency)) ||
    !['symbol', 'code'].includes(pricing_prefs.priceDisplay) ||
    !['none', 'nearest-0.05', 'nearest-0.1', 'nearest-0.5'].includes(pricing_prefs.rounding) ||
    typeof pricing_prefs.taxInclusive !== 'boolean'
  ) {
    return res.status(400).json({ error: 'Invalid pricing preferences' });
  }
  try {
    await prisma.admin.update({ where: { id: req.user.id }, data: { pricing_prefs } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/billing', authenticate, async (req, res) => {
  const { billing_settings } = req.body;
  if (!billing_settings || typeof billing_settings !== 'object') {
    return res.status(400).json({ error: 'Invalid billing settings' });
  }
  const vatPercent = Number(billing_settings.vatPercent);
  const serviceChargePercent = Number(billing_settings.serviceChargePercent);
  const deliveryFee = Number(billing_settings.deliveryFee);
  if (
    !Number.isFinite(vatPercent) || vatPercent < 0 || vatPercent > 100 ||
    !Number.isFinite(serviceChargePercent) || serviceChargePercent < 0 || serviceChargePercent > 100 ||
    !Number.isFinite(deliveryFee) || deliveryFee < 0 || deliveryFee > 1000000 ||
    typeof billing_settings.showVatLine !== 'boolean' ||
    typeof billing_settings.showServiceChargeLine !== 'boolean'
  ) {
    return res.status(400).json({ error: 'Invalid billing settings' });
  }
  try {
    await prisma.admin.update({
      where: { id: req.user.id },
      data: {
        billing_settings: {
          vatPercent,
          serviceChargePercent,
          deliveryFee,
          showVatLine: billing_settings.showVatLine,
          showServiceChargeLine: billing_settings.showServiceChargeLine
        }
      }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Promotions ---
app.get('/api/promotions', authenticate, async (req, res) => {
  try {
    const promos = await prisma.promotion.findMany({
      where: { admin_id: req.user.id },
      orderBy: { created_at: 'desc' }
    });
    res.json(promos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/promotions', authenticate, async (req, res) => {
  const { id } = req.body;
  const code = String(req.body.code || '').trim().toUpperCase();
  const type = req.body.type;
  const value = Number(req.body.value);
  const appliesTo = req.body.applies_to || 'global';
  const minOrder = req.body.min_order == null ? null : Number(req.body.min_order);
  const usageLimit = req.body.usage_limit == null || req.body.usage_limit === '' ? null : Number(req.body.usage_limit);
  const startAt = req.body.start_at ? new Date(req.body.start_at) : null;
  const endAt = req.body.end_at ? new Date(req.body.end_at) : null;

  if (!code || !['percent', 'fixed'].includes(type) || !Number.isFinite(value) || value < 0) {
    return res.status(400).json({ error: 'Invalid promotion' });
  }
  if (type === 'percent' && value > 100) {
    return res.status(400).json({ error: 'Percentage discount cannot exceed 100' });
  }
  if (!['global', 'table'].includes(appliesTo)) {
    return res.status(400).json({ error: 'Invalid promotion scope' });
  }
  if (
    (minOrder !== null && (!Number.isFinite(minOrder) || minOrder < 0)) ||
    (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) ||
    (startAt && Number.isNaN(startAt.getTime())) ||
    (endAt && Number.isNaN(endAt.getTime())) ||
    (startAt && endAt && endAt <= startAt)
  ) {
    return res.status(400).json({ error: 'Invalid promotion limits or dates' });
  }

  try {
    const tableId = appliesTo === 'table' ? Number(req.body.table_id) : null;
    if (appliesTo === 'table') {
      const ownedTable = await prisma.table.findFirst({
        where: { id: tableId, admin_id: req.user.id },
        select: { id: true }
      });
      if (!ownedTable) return res.status(400).json({ error: 'Invalid promotion table' });
    }

    const data = {
      code,
      type,
      value,
      min_order: minOrder,
      start_at: startAt,
      end_at: endAt,
      usage_limit: usageLimit,
      active: req.body.active !== false,
      applies_to: appliesTo,
      table_id: tableId
    };

    let promo;
    if (id) {
      const ownedPromo = await prisma.promotion.findFirst({
        where: { id, admin_id: req.user.id },
        select: { id: true }
      });
      if (!ownedPromo) return res.status(404).json({ error: 'Promotion not found' });
      promo = await prisma.promotion.update({
        where: { id },
        data
      });
    } else {
      promo = await prisma.promotion.create({
        data: { ...data, admin_id: req.user.id }
      });
    }
    res.json(promo);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Promotion code already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/promotions/:id/active', authenticate, async (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'Active must be a boolean' });
  try {
    const ownedPromo = await prisma.promotion.findFirst({
      where: { id: req.params.id, admin_id: req.user.id },
      select: { id: true }
    });
    if (!ownedPromo) return res.status(404).json({ error: 'Promotion not found' });

    await prisma.promotion.update({
      where: { id: req.params.id },
      data: { active }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/settings', authenticate, async (req, res) => {
  const admin = await prisma.admin.findUnique({
    where: { id: req.user.id },
    select: { id: true, order_rules: true, kds_prefs: true }
  });
  res.json(admin);
});

app.put('/api/admin/settings/order-rules', authenticate, async (req, res) => {
  const { order_rules } = req.body;
  await prisma.admin.update({
    where: { id: req.user.id },
    data: { order_rules }
  });
  res.json({ success: true });
});

app.put('/api/admin/settings/kds-prefs', authenticate, async (req, res) => {
  const { kds_prefs } = req.body;
  await prisma.admin.update({
    where: { id: req.user.id },
    data: { kds_prefs }
  });
  res.json({ success: true });
});

app.put('/api/admin/theme', authenticate, async (req, res) => {
  const { theme, theme_mode, theme_color, font_family } = req.body;
  try {
    const updated = await prisma.admin.update({
      where: { id: req.user.id },
      data: { theme, theme_mode, theme_color, font_family },
      select: publicAdminSelect
    });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Uploads ---
app.post('/api/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  readFile(req.file.path).then(buffer => {
    if (!hasImageSignature(buffer, req.file.mimetype)) {
      return unlink(req.file.path)
        .catch(() => {})
        .then(() => res.status(400).json({ error: 'Uploaded file content does not match its image type' }));
    }
    // In prod, upload to S3 here. For now, return local path.
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    return res.json({ url: fileUrl });
  }).catch(() => res.status(400).json({ error: 'Unable to inspect uploaded file' }));
});

app.delete('/api/upload/:filename', authenticate, async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (filename !== req.params.filename) return res.status(400).json({ error: 'Invalid filename' });
  const filepath = path.join('uploads', filename);
  try {
    await unlink(filepath);
    res.json({ success: true });
  } catch (err) {
    // If file doesn't exist, just return success
    if (err.code === 'ENOENT') return res.json({ success: true });
    res.status(500).json({ error: err.message });
  }
});

// --- Super Admin Routes ---
app.post('/api/super-admin/login', authRateLimit, async (req, res) => {
  const { email, password } = req.body;
  try {
    const superAdmin = await prisma.superAdmin.findUnique({ where: { email } });

    if (!superAdmin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!(await bcrypt.compare(password, superAdmin.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await prisma.superAdmin.update({
      where: { id: superAdmin.id },
      data: { last_login: new Date() }
    });

    const token = jwt.sign(
      { id: superAdmin.id, email: superAdmin.email, role: 'SUPER_ADMIN' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: superAdmin.id, email: superAdmin.email, name: superAdmin.name, role: 'SUPER_ADMIN' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all restaurants with subscription info
app.get('/api/super-admin/restaurants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const restaurants = await prisma.admin.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        email: true,
        restaurant_name: true,
        subscription_plan: true,
        subscription_status: true,
        subscription_end: true,
        trial_ends_at: true,
        max_tables: true,
        max_menu_items: true,
        max_staff_accounts: true,
        created_at: true,
        _count: {
          select: {
            menus: { where: { deleted_at: null } },
            tables: true,
            orders: true
          }
        }
      }
    });

    res.json(restaurants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get platform stats
app.get('/api/super-admin/stats', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const totalRestaurants = await prisma.admin.count();
    const activeRestaurants = await prisma.admin.count({
      where: { subscription_status: 'ACTIVE' }
    });

    // Calculate MRR (Monthly Recurring Revenue)
    const restaurants = await prisma.admin.findMany({
      where: { subscription_status: 'ACTIVE' },
      select: { subscription_plan: true }
    });

    const planPrices = { STANDARD: 10, BASIC: 29, PRO: 79 };
    const totalRevenue = restaurants.reduce((sum, r) => {
      return sum + (planPrices[r.subscription_plan] || 0);
    }, 0);

    // Growth calculation (simplified - compare last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentSignups = await prisma.admin.count({
      where: { created_at: { gte: thirtyDaysAgo } }
    });
    const growth = totalRestaurants > 0 ? Math.round((recentSignups / totalRestaurants) * 100) : 0;

    res.json({
      totalRestaurants,
      activeRestaurants,
      totalRevenue,
      growth
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update restaurant subscription plan
app.put('/api/super-admin/restaurants/:id/plan', authenticate, requireSuperAdmin, async (req, res) => {
  const { plan, status, subscription_end } = req.body;
  const restaurantId = req.params.id;
  const allowedPlans = new Set(['STANDARD', 'BASIC', 'PRO']);
  const allowedStatuses = new Set(['ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIAL']);
  if (!allowedPlans.has(plan) || (status && !allowedStatuses.has(status))) {
    return res.status(400).json({ error: 'Invalid subscription plan or status' });
  }

  try {
    // Plan limits based on tier
    const planLimits = {
      STANDARD: { max_tables: 10, max_menu_items: 50, max_staff_accounts: 1 },
      BASIC: { max_tables: 25, max_menu_items: 150, max_staff_accounts: 3 },
      PRO: { max_tables: 999999, max_menu_items: 999999, max_staff_accounts: 10 }
    };

    const limits = planLimits[plan] || planLimits.STANDARD;

    const updated = await prisma.admin.update({
      where: { id: restaurantId },
      data: {
        subscription_plan: plan,
        subscription_status: status || 'ACTIVE',
        subscription_end: subscription_end ? new Date(subscription_end) : null,
        ...limits
      }
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (isProduction) {
  const clientDist = path.resolve(process.cwd(), 'dist');
  app.use(express.static(clientDist, {
    index: false,
    maxAge: '1y',
    immutable: true,
  }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err?.message?.startsWith('Only JPEG')) {
    return res.status(400).json({ error: err.message });
  }
  if (err?.message === 'Origin not allowed by CORS') {
    return res.status(403).json({ error: err.message });
  }
  console.error('Unhandled request error:', err);
  return res.status(500).json({ error: 'Internal server error' });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`)); // 6. Start server
