import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import prisma from './db.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'node:fs';
import { readFile, unlink } from 'fs/promises';
import { ORDER_STATUSES, canTransitionOrder } from './orderTransitions.js';
import {
  MEMBERSHIP_STATUSES,
  ORGANIZATION_ROLES,
  canAssignOrganizationRole,
  isUuid,
} from './tenantAccess.js';
import { createTenantSessionService } from './tenantSession.js';
import {
  assertCatalogOwnership,
  createAuthenticate,
  requireOrganizationRole,
  requireRecentSuperAdmin,
  requireSuperAdmin,
} from './accessControl.js';
import { createRateLimiter } from './rateLimit.js';
import { ERROR_CODES, sendError, errorContractMiddleware, logSafeError } from './errors.js';
import { createRequestContextMiddleware } from './requestContext.js';
import {
  TOKEN_TYPES,
  issueToken,
} from './tokenPolicy.js';
import { createTableCapabilityService, hashTableCapability } from './tableCapability.js';
import {
  createPublicOrderIdempotencyService,
  isPublicOrderIdempotencyUniqueConflict,
  publicOrderRequestHash,
  requireIdempotencyKey,
} from './orderIdempotency.js';
import { enforcePublicOrderCapacity } from './orderCapacity.js';
import {
  ORDERING_STATES,
  assertPublicOrderAvailable,
  createPublicOrderRejectionTelemetry,
} from './publicOrderAvailability.js';
import {
  OrderTrackingAuthorizationError,
  createOrderRealtimeService,
} from './orderRealtime.js';
import { resolveRuntimeConfig } from './runtimeConfig.js';
import { createSuperAdminAuthService, resolveMfaEncryptionKey } from './superAdminAuth.js';
import { captureServerException, flushServerTelemetry } from './telemetry.js';
import {
  PaginationError,
  cursorWhere,
  presentPage,
  resolveCursorPagination,
} from './pagination.js';
import { createAnalyticsService, resolveAnalyticsRange } from './analytics.js';
import { createRestaurantInvitationService } from './restaurantInvitations.js';
import { hasRestaurantAccess, validateSubscriptionInput } from './subscriptionPolicy.js';

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? null : 'development-only-change-me');
const runtimeConfig = resolveRuntimeConfig();

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

mkdirSync(runtimeConfig.uploadDirectory, { recursive: true, mode: 0o750 });

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

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
  exposedHeaders: ['X-Request-Id', 'Idempotency-Replayed'],
};

const superAdminSessionCookie = (token, maxAge = 30 * 60) => [
  `boltqr_superadmin=${token || ''}`,
  'HttpOnly',
  'SameSite=Strict',
  'Path=/api/super-admin',
  `Max-Age=${maxAge}`,
  ...(isProduction ? ['Secure'] : []),
].join('; ');

const {
  resolveTenantSession,
  resolveTenantClaims,
  issueTenantToken,
  tenantResponse,
} = createTenantSessionService({ db: prisma, tokenSecret: JWT_SECRET });

const authenticate = createAuthenticate({
  db: prisma,
  tokenSecret: JWT_SECRET,
  resolveTenantClaims,
});

const superAdminAuth = createSuperAdminAuthService({
  db: prisma,
  tokenSecret: JWT_SECRET,
  encryptionKey: resolveMfaEncryptionKey({ jwtSecret: JWT_SECRET }),
});
const restaurantInvitations = createRestaurantInvitationService({ db: prisma });

const tableCapabilities = createTableCapabilityService({ db: prisma, tokenSecret: JWT_SECRET });
const analyticsService = createAnalyticsService({ database: prisma });
const publicOrderIdempotency = createPublicOrderIdempotencyService();
const publicOrderRejectionTelemetry = createPublicOrderRejectionTelemetry();
const orderRealtime = createOrderRealtimeService({
  db: prisma,
  tokenSecret: JWT_SECRET,
  resolveTenantClaims,
});

const app = express();
const server = createServer(app);
const trustedProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || '', 10);
if (Number.isInteger(trustedProxyHops) && trustedProxyHops >= 0) {
  app.set('trust proxy', trustedProxyHops);
}
const io = new Server(server, {
  cors: corsOptions
});
orderRealtime.register(io);

const upload = multer({
  dest: runtimeConfig.uploadDirectory,
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
app.use(createRequestContextMiddleware({ onServerError: captureServerException }));
app.use(errorContractMiddleware);
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

// Uploaded assets are returned by the API host while the dev client runs on
// Vite's host. Serve known uploads with their stored image MIME type so the
// browser can render them despite the API/client using different origins.
app.get('/uploads/:filename', async (req, res, next) => {
  const filename = path.basename(req.params.filename);
  if (filename !== req.params.filename) return res.status(400).json({ error: 'Invalid filename' });

  try {
    const asset = await prisma.upload.findUnique({
      where: { filename },
      select: { mime_type: true },
    });
    if (!asset) return next();

    res.setHeader('Content-Type', asset.mime_type);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.sendFile(path.join(runtimeConfig.uploadDirectory, filename), {
      dotfiles: 'deny',
      maxAge: isProduction ? '1y' : 0,
      immutable: isProduction,
    });
  } catch (error) {
    return next(error);
  }
});

app.use('/uploads', express.static(runtimeConfig.uploadDirectory, {
  dotfiles: 'deny',
  index: false,
  maxAge: isProduction ? '1y' : 0,
  immutable: isProduction,
  setHeaders: response => {
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const orderRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 30 });
const tableExchangeIpRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  key: req => `table-exchange-ip:${req.ip}`,
});
const tableExchangeCapabilityRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  key: req => `table-exchange-capability:${hashTableCapability(req.body?.capability)}`,
});
const tableSessionOrderRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 8,
  key: req => `table-order-session:${req.tableSession?.sessionId || 'invalid'}`,
});
const organizationOrderRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 120,
  key: req => `table-order-organization:${req.tableSession?.organizationId || 'invalid'}`,
});

const enforceRateLimit = (limiter, req, res) => new Promise((resolve, reject) => {
  limiter(req, res, error => error ? reject(error) : resolve());
});

const normalizeCatalogIds = (values = []) => [...new Set(
  values.map(value => Number(value)).filter(Number.isInteger)
)];

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
  res.json({ status: 'ok', release: runtimeConfig.releaseVersion });
});

app.get('/api/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', database: 'ok', release: runtimeConfig.releaseVersion });
  } catch (err) {
    console.error('Readiness check failed:', err);
    res.status(503).json({ status: 'not_ready', database: 'unavailable' });
  }
});

// Backward-compatible health probe for Render and local smoke checks.
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'ok', release: runtimeConfig.releaseVersion });
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

app.post('/api/auth/activate', authRateLimit, async (req, res) => {
  try {
    const admin = await restaurantInvitations.activate({
      token: req.body.token,
      password: req.body.password,
    });
    res.json({
      activated: true,
      restaurant: {
        id: admin.id,
        email: admin.email,
        restaurantName: admin.restaurant_name,
      },
    });
  } catch (error) {
    sendError(res, req, error);
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
    if (!isUuid(userId) || (!role && !status) || (role && !ORGANIZATION_ROLES.includes(role)) ||
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
      orderRealtime.revokeMembership({
        organizationId: req.auth.organizationId,
        userId: updated.user_id,
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
        organization_id: req.auth.organizationId,
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
    if (ingredients.some(item =>
      !Number.isInteger(Number(item.max_extra)) ||
      Number(item.max_extra) < 0 ||
      (item.extra_price_override != null && item.extra_price_override !== '' &&
        (!Number.isFinite(Number(item.extra_price_override)) || Number(item.extra_price_override) < 0)) ||
      (item.extra_available && Number(item.max_extra) < 1)
    )) {
      return res.status(400).json({ error: 'Invalid ingredient extra configuration' });
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
      where: { id: menuId, user_id: req.user.id, organization_id: req.auth.organizationId },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });
    if (!Array.isArray(groups)) return res.status(400).json({ error: 'Modifier groups must be an array' });

    await prisma.$transaction(async (tx) => {
      const currentLinks = await tx.menuModifierGroup.findMany({
        where: {
          menu_id: menuId,
          modifier_group: { organization_id: req.auth.organizationId },
        },
        select: { group_id: true }
      });
      const editableGroupIds = new Set(currentLinks.map(link => link.group_id));
      const groupIds = [];
      for (const gr of groups) {
        let gid = gr.id ? Number(gr.id) : undefined;
        if (gid && !editableGroupIds.has(gid)) {
          throw Object.assign(new Error('Modifier group not found'), { status: 404 });
        }
        const selectionType = gr.selection_type === 'multi' ? 'multi' : gr.selection_type === 'single' ? 'single' : null;
        const minSelect = Number(gr.min_select ?? 0);
        const maxSelect = selectionType === 'single' ? 1 : Number(gr.max_select ?? 1);
        if (!selectionType || !Number.isInteger(minSelect) || !Number.isInteger(maxSelect) || minSelect < 0 || maxSelect < 1 || minSelect > maxSelect) {
          throw Object.assign(new Error('Invalid modifier selection limits'), { status: 400 });
        }
        if (minSelect > (Array.isArray(gr.options) ? gr.options.length : 0)) {
          throw Object.assign(new Error('Modifier group requires more options than are configured'), { status: 400 });
        }
        if (selectionType === 'single' && Array.isArray(gr.options) && gr.options.filter(option => option.is_default).length > 1) {
          throw Object.assign(new Error('Single-select modifier groups can have only one default option'), { status: 400 });
        }
        if (Array.isArray(gr.options) && gr.options.some(option =>
          option.max_qty != null && (!Number.isInteger(Number(option.max_qty)) || Number(option.max_qty) < 1)
        )) {
          throw Object.assign(new Error('Invalid modifier option quantity'), { status: 400 });
        }
        const data = {
          name_en: gr.name_en,
          name_ar: gr.name_ar,
          selection_type: selectionType,
          min_select: minSelect,
          max_select: maxSelect,
          required: gr.required
        };

        if (gid) {
          await tx.modifierGroup.update({ where: { id: gid }, data });
        } else {
          const newG = await tx.modifierGroup.create({
            data: { ...data, organization_id: req.auth.organizationId }
          });
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
  const requestedCombos = Array.isArray(req.body.combos)
    ? req.body.combos
    : req.body.combo && typeof req.body.combo === 'object'
      ? [req.body.combo]
      : null;
  try {
    const ownedMenu = await prisma.menu.findFirst({
      where: { id: menuId, user_id: req.user.id },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });
    if (!requestedCombos) return res.status(400).json({ error: 'Combo configuration required' });

    await prisma.$transaction(async (tx) => {
      await tx.comboGroup.deleteMany({ where: { menu_id: menuId } });

      for (const combo of requestedCombos) {
        const minSelect = Number(combo.min_select ?? 0);
        const maxSelect = Number(combo.max_select ?? 1);
        if (!Number.isInteger(minSelect) || !Number.isInteger(maxSelect) || minSelect < 0 || maxSelect < 1 || minSelect > maxSelect) {
          throw Object.assign(new Error('Invalid combo selection limits'), { status: 400 });
        }

        const items = Array.isArray(combo.items) ? combo.items.filter(i => i.child_menu_id) : [];
        const childIds = items.map(i => Number(i.child_menu_id));
        if (childIds.some(id => !Number.isInteger(id)) || new Set(childIds).size !== childIds.length) {
          throw Object.assign(new Error('Invalid combo item list'), { status: 400 });
        }
        if (minSelect > childIds.length) {
          throw Object.assign(new Error('Combo requires more items than are configured'), { status: 400 });
        }
        const ownedChildren = await tx.menu.count({
          where: { id: { in: childIds }, user_id: req.user.id, deleted_at: null }
        });
        if (ownedChildren !== new Set(childIds).size) {
          throw Object.assign(new Error('Combo contains an invalid menu item'), { status: 400 });
        }

        const newGroup = await tx.comboGroup.create({
          data: { menu_id: menuId, min_select: minSelect, max_select: maxSelect }
        });
        if (items.length) {
          await tx.comboGroupItem.createMany({
            data: items.map(i => ({
              group_id: newGroup.id,
              child_menu_id: Number(i.child_menu_id),
              upgrade_price_delta: i.upgrade_price_delta,
              is_default: i.is_default
            }))
          });
        }
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
        include: {
          category: true,
          admin: {
            select: {
              subscription_status: true,
              subscription_end: true,
              trial_ends_at: true,
            },
          },
        }
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

    if (!menu || !hasRestaurantAccess(menu.admin)) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    const { admin: _subscription, ...publicMenu } = menu;
    res.json({
      menu: publicMenu,
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
      data: {
        admin_id: req.user.id,
        organization_id: req.auth.organizationId,
        name_en,
        name_ar,
      }
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
  const extraPrice = req.body.extra_price == null || req.body.extra_price === ''
    ? 0
    : Number(req.body.extra_price);
  if (!name_en) return res.status(400).json({ error: 'English ingredient name is required' });
  if (!Number.isFinite(extraPrice) || extraPrice < 0) {
    return res.status(400).json({ error: 'Ingredient extra price must be a non-negative number' });
  }
  try {
    const ingredient = await prisma.ingredient.create({
      data: {
        admin_id: req.user.id,
        organization_id: req.auth.organizationId,
        name_en,
        name_ar,
        extra_price: extraPrice,
      }
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
    const { limit, cursor } = resolveCursorPagination(req.query, {
      defaultLimit: 50,
      maxLimit: 100,
      idType: 'integer',
    });
    const scope = String(req.query.scope || 'all');
    const status = req.query.status == null ? null : String(req.query.status);
    if (!['all', 'active', 'history'].includes(scope) || (status && !ORDER_STATUSES.has(status))) {
      throw new PaginationError('Order pagination filter is invalid');
    }
    const statusFilter = status
      ? { status }
      : scope === 'active'
        ? { status: { in: ['pending', 'preparing', 'ready'] } }
        : scope === 'history'
          ? { status: { in: ['served', 'cancelled'] } }
          : {};
    const rows = await prisma.order.findMany({
      where: {
        organization_id: req.auth.organizationId,
        ...statusFilter,
        ...cursorWhere(cursor),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        table: true,
        order_items: {
          include: { menu: true }
        }
      }
    });
    const page = presentPage(rows, limit);
    const orders = page.items;

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

    const items = orders.map(order => ({
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
    }));
    res.json({ ...page, items });
  } catch (err) {
    if (err instanceof PaginationError) return sendError(res, req, err);
    console.error('Order pagination failed:', logSafeError(err));
    return sendError(res, req, err);
  }
});

const publicOrderInclude = {
  table: true,
  order_items: { include: { menu: true } },
};

const findPublicOrder = (db, orderId) => db.order.findUnique({
  where: { id: orderId },
  include: publicOrderInclude,
});

const presentPublicOrder = order => {
  const { table_session_id: _tableSessionId, ...safeOrder } = order;
  return safeOrder;
};

app.post('/api/orders', orderRateLimit, async (req, res) => {
  const { items, type, promotionCode, tipPercent } = req.body;

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return res.status(400).json({ error: 'Order must contain between 1 and 50 items' });
  }
  if (!['dine_in', 'take_away'].includes(type)) {
    return res.status(400).json({ error: 'Invalid order type' });
  }
  if (type === 'take_away') {
    return res.status(403).json({
      error: 'Takeaway ordering is disabled for Release 1',
      code: ERROR_CODES.ORDER_TYPE_DISABLED,
    });
  }
  if (!Number.isFinite(Number(tipPercent ?? 0)) || Number(tipPercent ?? 0) < 0 || Number(tipPercent ?? 0) > 100) {
    return res.status(400).json({ error: 'Invalid tip percentage' });
  }

  try {
    const authorization = String(req.headers.authorization || '');
    const tableToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!tableToken) {
      throw Object.assign(new Error('Table session required for dine-in orders'), {
        status: 401,
        code: ERROR_CODES.TABLE_SESSION_REQUIRED,
      });
    }

    req.tableSession = await tableCapabilities.resolveSession(tableToken);
    await enforceRateLimit(tableSessionOrderRateLimit, req, res);
    await enforceRateLimit(organizationOrderRateLimit, req, res);

    const idempotencyKey = requireIdempotencyKey(req.get('Idempotency-Key'));
    const requestHash = publicOrderRequestHash({
      items,
      type,
      promotionCode: promotionCode || null,
      tipPercent: Number(tipPercent || 0),
    });
    const idempotencyScope = {
      organizationId: req.tableSession.organizationId,
      tableId: req.tableSession.table.id,
      capabilityId: req.tableSession.capabilityId,
      capabilityVersion: req.tableSession.capabilityVersion,
      key: idempotencyKey,
      requestHash,
    };

    let transactionResult;
    try {
      transactionResult = await prisma.$transaction(async (tx) => {
        const tableSession = await tableCapabilities.resolveSession(tableToken, {
          database: tx,
          lock: true,
        });
        const adminId = tableSession.adminId;
        const table = tableSession.table;
        const idempotency = await publicOrderIdempotency.begin(tx, {
          ...idempotencyScope,
          organizationId: tableSession.organizationId,
          tableId: table.id,
          capabilityId: tableSession.capabilityId,
          capabilityVersion: tableSession.capabilityVersion,
        });
        if (idempotency.replayed) {
          const replayedOrder = await findPublicOrder(tx, idempotency.orderId);
          if (!replayedOrder) throw new Error('Idempotent order record is unavailable');
          return { order: replayedOrder, replayed: true };
        }

        assertPublicOrderAvailable({
          branch: table.branch,
          table,
          organizationId: tableSession.organizationId,
        });

        await enforcePublicOrderCapacity(tx, {
          organizationId: tableSession.organizationId,
          tableId: table.id,
          tableSessionId: tableSession.sessionId,
        });

        const targetAdmin = await tx.admin.findUnique({
        where: { id: adminId },
        select: {
          id: true,
          organization_id: true,
          subscription_status: true,
          subscription_end: true,
          trial_ends_at: true,
          billing_settings: true,
          pricing_prefs: true
        }
      });
      if (!hasRestaurantAccess(targetAdmin)) {
        throw Object.assign(new Error('Restaurant is not accepting orders'), { status: 403 });
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
        tx.menuIngredient.findMany({
          where: { menu_id: { in: menuIds } },
          include: { ingredient: { select: { extra_price: true } } },
        }),
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
            const extraPrice = configured.extra_price_override ?? configured.ingredient?.extra_price ?? 0;
            ingredientDelta += Number(extraPrice) * selection.qty;
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
        table_session_id: tableSession.sessionId,
        admin: { connect: { id: adminId } },
        organization: { connect: { id: tableSession.organizationId } },
      };
      if (table.branch_id) orderData.branch = { connect: { id: table.branch_id } };
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
        await publicOrderIdempotency.complete(tx, {
          idempotencyId: idempotency.idempotencyId,
          orderId: order.id,
        });
        const createdOrder = await findPublicOrder(tx, order.id);
        if (!createdOrder) throw new Error('Created order is unavailable');
        return { order: createdOrder, replayed: false };
      });
    } catch (transactionError) {
      if (!isPublicOrderIdempotencyUniqueConflict(transactionError)) throw transactionError;
      const replay = await publicOrderIdempotency.replayAfterUniqueConflict(prisma, idempotencyScope);
      const replayedOrder = await findPublicOrder(prisma, replay.orderId);
      if (!replayedOrder) throw new Error('Idempotent order record is unavailable');
      transactionResult = { order: replayedOrder, replayed: true };
    }

    // Emit only for the transaction that created the order. Replays return
    // the same order without duplicating socket events or table mutations.
    const { order: fullOrder, replayed } = transactionResult;
    const presentedOrder = presentPublicOrder(fullOrder);
    if (!replayed && fullOrder?.admin_id) {
      orderRealtime.emitCreated(io, fullOrder, presentedOrder);
      if (fullOrder?.table) {
        io.to(orderRealtime.adminRealtimeRoom({
          organizationId: fullOrder.organization_id,
          adminId: fullOrder.admin_id,
        })).emit('table-updated', {
          ...fullOrder.table,
          status: 'occupied'
        });
      }
    }

    const trackingToken = await orderRealtime.getOrCreateTrackingToken(fullOrder);
    res.setHeader('Idempotency-Replayed', String(replayed));
    res.status(replayed ? 200 : 201).json({ ...presentedOrder, tracking_token: trackingToken });
  } catch (err) {
    if (req.tableSession) {
      publicOrderRejectionTelemetry.record({
        requestId: req.requestId,
        organizationId: req.tableSession.organizationId,
        branchId: req.tableSession.table.branch_id,
        tableId: req.tableSession.table.id,
        reasonCode: err.code,
        counters: err.telemetryCounters,
      });
    }
    if (!err.status || err.status >= 500) console.error('Error creating order:', logSafeError(err));
    sendError(res, req, err);
  }
});

app.get('/api/public/orders/:id/status', async (req, res) => {
  const orderId = Number(req.params.id);
  const authorization = String(req.headers.authorization || '');
  const trackingToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return sendError(res, req, Object.assign(new Error('Invalid order identifier'), {
      status: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
    }));
  }
  if (!trackingToken) {
    return sendError(res, req, Object.assign(new Error('Order tracking credentials are required'), {
      status: 401,
      code: ERROR_CODES.AUTHENTICATION_REQUIRED,
    }));
  }

  try {
    const order = await orderRealtime.resolveTrackingOrder({ orderId, trackingToken });
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      id: order.id,
      status: order.status,
      version: order.version,
      updated_at: order.updated_at,
    });
  } catch (error) {
    if (error instanceof OrderTrackingAuthorizationError) {
      const invalidCredential = error.reason === 'INVALID_CREDENTIAL';
      return sendError(res, req, Object.assign(new Error(
        invalidCredential
          ? 'Order tracking credentials are invalid or expired'
          : 'Order not found',
      ), {
        status: invalidCredential ? 401 : 404,
        code: invalidCredential ? ERROR_CODES.AUTHENTICATION_REQUIRED : ERROR_CODES.ORDER_NOT_FOUND,
      }));
    }
    console.error('Error fetching order status:', logSafeError(error));
    return sendError(res, req, error);
  }
});

app.put('/api/orders/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;
  if (!ORDER_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid order status' });
  try {
    const result = await prisma.$transaction(async tx => {
      const current = await tx.order.findFirst({
        where: {
          id: Number(req.params.id),
          admin_id: req.user.id,
          organization_id: req.auth.organizationId,
        },
        select: { id: true, status: true, version: true, table_id: true }
      });
      if (!current) throw Object.assign(new Error('Order not found'), { status: 404 });
      if (current.status === status) {
        return {
          changed: false,
          order: await tx.order.findUnique({ where: { id: current.id } }),
          releasedTable: null,
        };
      }
      if (!canTransitionOrder(current.status, status)) {
        throw Object.assign(new Error(`Cannot move order from ${current.status} to ${status}`), { status: 409 });
      }

      const updated = await tx.order.updateMany({
        where: {
          id: current.id,
          admin_id: req.user.id,
          organization_id: req.auth.organizationId,
          version: current.version,
        },
        data: { status, version: { increment: 1 } }
      });
      if (updated.count !== 1) throw Object.assign(new Error('Order changed; refresh and retry'), { status: 409 });
      const order = await tx.order.findUnique({ where: { id: current.id } });
      let releasedTable = null;
      if (current.table_id && ['served', 'cancelled'].includes(status)) {
        const activeOrders = await tx.order.count({
          where: {
            organization_id: req.auth.organizationId,
            table_id: current.table_id,
            id: { not: current.id },
            status: { in: ['pending', 'preparing', 'ready'] },
          },
        });
        if (activeOrders === 0) {
          releasedTable = await tx.table.update({
            where: { id: current.table_id },
            data: { status: 'available' },
          });
        }
      }
      return { changed: true, order, releasedTable };
    }, { isolationLevel: 'Serializable' });

    if (result.changed) {
      orderRealtime.emitStatus(io, result.order);
      if (result.releasedTable) {
        io.to(orderRealtime.adminRealtimeRoom({
          organizationId: result.order.organization_id,
          adminId: result.order.admin_id,
        })).emit('table-updated', result.releasedTable);
      }
    }
    res.json(result.order);
  } catch (err) { res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' }); }
});

// --- Tables ---
app.get('/api/tables', authenticate, async (req, res) => {
  const tables = await prisma.table.findMany({
    where: { admin_id: req.user.id, organization_id: req.auth.organizationId },
    orderBy: { created_at: 'asc' }
  });
  res.json(tables);
});

app.post('/api/tables', authenticate, async (req, res) => {
  const { code, number, capacity } = req.body;
  const admin_id = req.user.id; // Get user ID from authenticated token
  // Handle frontend sending 'number' instead of 'code'
  const tableCode = String(code || number || '').trim();
  const tableCapacity = capacity == null || capacity === '' ? 4 : Number(capacity);
  if (!tableCode || tableCode.length > 50 || !Number.isInteger(tableCapacity) || tableCapacity < 1 || tableCapacity > 100) {
    return res.status(400).json({ error: 'A valid table code and capacity between 1 and 100 are required' });
  }

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

    const defaultBranch = req.auth.branchId && await prisma.branch.findFirst({
      where: {
        id: req.auth.branchId,
        organization_id: req.auth.organizationId,
        active: true,
      },
      select: { id: true },
    });
    if (!defaultBranch) {
      return res.status(409).json({ error: 'An active default branch is required to create a table' });
    }

    const table = await prisma.table.create({
      data: {
        code: tableCode,
        capacity: tableCapacity,
        admin_id,
        organization_id: req.auth.organizationId,
        branch_id: defaultBranch.id,
      }
    });
    res.json(table);
  } catch (err) {
    console.error('Error creating table:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get(
  '/api/branches/:branchId/ordering-state',
  authenticate,
  requireOrganizationRole('OWNER', 'MANAGER'),
  async (req, res) => {
    const branchId = String(req.params.branchId || '');
    if (!isUuid(branchId)) return res.status(400).json({ error: 'Valid branch is required' });
    try {
      const branch = await prisma.branch.findFirst({
        where: { id: branchId, organization_id: req.auth.organizationId },
        select: { id: true, ordering_state: true, ordering_state_updated_at: true },
      });
      if (!branch) return res.status(404).json({ error: 'Branch not found' });
      res.json({
        branchId: branch.id,
        state: branch.ordering_state,
        updatedAt: branch.ordering_state_updated_at,
      });
    } catch (error) {
      sendError(res, req, error);
    }
  },
);

app.put(
  '/api/branches/:branchId/ordering-state',
  authenticate,
  requireOrganizationRole('OWNER', 'MANAGER'),
  async (req, res) => {
    const branchId = String(req.params.branchId || '');
    const state = String(req.body.state || '').toUpperCase();
    if (!isUuid(branchId) || !ORDERING_STATES.includes(state)) {
      return res.status(400).json({ error: 'Valid branch and ordering state are required' });
    }

    try {
      const branch = await prisma.$transaction(async tx => {
        const current = await tx.branch.findFirst({
          where: { id: branchId, organization_id: req.auth.organizationId },
          select: { id: true, organization_id: true, ordering_state: true, ordering_state_updated_at: true },
        });
        if (!current) throw Object.assign(new Error('Branch not found'), { status: 404 });
        if (current.ordering_state === state) return current;

        const updated = await tx.branch.update({
          where: { id: current.id },
          data: { ordering_state: state, ordering_state_updated_at: new Date() },
          select: { id: true, organization_id: true, ordering_state: true, ordering_state_updated_at: true },
        });
        await tx.auditEvent.create({
          data: {
            organization_id: current.organization_id,
            branch_id: current.id,
            actor_admin_id: req.user.id,
            action: 'ORDERING_STATE_CHANGED',
            entity_type: 'Branch',
            entity_id: current.id,
            metadata: {
              previousState: current.ordering_state,
              newState: state,
              requestId: req.requestId,
            },
          },
        });
        return updated;
      }, { isolationLevel: 'Serializable' });
      res.json({
        branchId: branch.id,
        state: branch.ordering_state,
        updatedAt: branch.ordering_state_updated_at,
      });
    } catch (error) {
      sendError(res, req, error);
    }
  },
);

app.put('/api/tables/:id', authenticate, async (req, res) => {
  const { code, capacity, status } = req.body;
  try {
    const tableId = Number(req.params.id);
    const ownedTable = await prisma.table.findFirst({
      where: { id: tableId, admin_id: req.user.id, organization_id: req.auth.organizationId },
      select: { id: true }
    });
    if (!ownedTable) return res.status(404).json({ error: 'Table not found' });

    const allowedStatuses = new Set(['available', 'occupied', 'reserved', 'cleaning']);
    const data = {};
    if (code !== undefined) {
      const normalizedCode = String(code).trim();
      if (!normalizedCode || normalizedCode.length > 50) return res.status(400).json({ error: 'Invalid table code' });
      data.code = normalizedCode;
    }
    if (capacity !== undefined) {
      const normalizedCapacity = Number(capacity);
      if (!Number.isInteger(normalizedCapacity) || normalizedCapacity < 1 || normalizedCapacity > 100) {
        return res.status(400).json({ error: 'Capacity must be an integer between 1 and 100' });
      }
      data.capacity = normalizedCapacity;
    }
    if (status !== undefined) {
      if (!allowedStatuses.has(status)) return res.status(400).json({ error: 'Invalid table status' });
      data.status = status;
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: 'No table changes were supplied' });

    const table = await prisma.table.update({
      where: { id: tableId },
      data,
    });
    res.json(table);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tables/:id', authenticate, async (req, res) => {
  try {
    const tableId = Number(req.params.id);
    const table = await prisma.table.findFirst({
      where: { id: tableId, admin_id: req.user.id, organization_id: req.auth.organizationId },
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    if (table.status === 'occupied') {
      return res.status(400).json({ error: 'Cannot delete an occupied table' });
    }

    await prisma.table.delete({ where: { id: tableId } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tables/:id/capability/rotate', authenticate, async (req, res) => {
  try {
    const result = await tableCapabilities.rotate({
      tableId: req.params.id,
      adminId: req.user.id,
      organizationId: req.auth.organizationId,
    });
    res.json(result);
  } catch (error) {
    sendError(res, req, error);
  }
});

app.delete('/api/tables/:id/capability', authenticate, async (req, res) => {
  try {
    const result = await tableCapabilities.revoke({
      tableId: req.params.id,
      adminId: req.user.id,
      organizationId: req.auth.organizationId,
    });
    res.json(result);
  } catch (error) {
    sendError(res, req, error);
  }
});

app.post(
  '/api/public/table-session',
  tableExchangeIpRateLimit,
  tableExchangeCapabilityRateLimit,
  async (req, res) => {
    try {
      const result = await tableCapabilities.exchange(req.body?.capability);
      if (result.tableStatusChanged) {
        io.to(orderRealtime.adminRealtimeRoom({
          organizationId: result.organizationId,
          adminId: result.restaurantId,
        })).emit('table-updated', {
          id: result.table.id,
          status: 'occupied',
        });
      }
      res.json(result);
    } catch (error) {
      sendError(res, req, error);
    }
  },
);

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
        billing_settings: true,
        theme: true,
        theme_mode: true,
        theme_color: true,
        font_family: true,
        subscription_status: true,
        subscription_end: true,
        trial_ends_at: true,
      }
    });

    if (!hasRestaurantAccess(admin)) {
      return res.status(404).json({ error: 'Restaurant settings not found' });
    }

    const {
      subscription_status: _status,
      subscription_end: _subscriptionEnd,
      trial_ends_at: _trialEndsAt,
      ...publicPricing
    } = admin;
    res.json(publicPricing);
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
    const restaurant = await prisma.admin.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        subscription_status: true,
        subscription_end: true,
        trial_ends_at: true,
      }
    });
    if (!hasRestaurantAccess(restaurant)) return res.status(404).json({ error: 'Restaurant not found' });

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
    const restaurant = await prisma.admin.findUnique({
      where: { id: adminId },
      select: {
        subscription_status: true,
        subscription_end: true,
        trial_ends_at: true,
      },
    });
    if (!hasRestaurantAccess(restaurant)) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }
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
        menu_modifier_groups: true,
        combo_groups: true,
      }
    });

    const mapped = menus.map(m => ({
      ...m,
      categories: m.category,
      ingredients_details: m.menu_ingredients,
      // Dynamically compute has_modifiers since the DB field might be stale
      has_modifiers:
        (m.menu_modifier_groups && m.menu_modifier_groups.length > 0) ||
        (m.menu_ingredients && m.menu_ingredients.length > 0) ||
        (m.combo_groups && m.combo_groups.length > 0) ||
        m.has_modifiers
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
    const { limit, cursor } = resolveCursorPagination(req.query, {
      defaultLimit: 50,
      maxLimit: 100,
      idType: 'uuid',
    });
    const admins = await prisma.admin.findMany({
      where: cursorWhere(cursor),
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: publicAdminSelect,
    });
    res.json(presentPage(admins, limit));
  } catch (err) {
    if (err instanceof PaginationError) return sendError(res, req, err);
    return sendError(res, req, err);
  }
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
  try {
    res.json(await analyticsService.summarize({
      organizationId: req.auth.organizationId,
      query: req.query,
    }));
  } catch (err) {
    if (err?.status === 400) return sendError(res, req, err);
    console.error('Analytics summary failed:', logSafeError(err));
    return sendError(res, req, err);
  }
});

app.get('/api/admin/analytics/orders', authenticate, async (req, res) => {
  try {
    const { limit, cursor } = resolveCursorPagination(req.query, {
      defaultLimit: 100,
      maxLimit: 200,
      idType: 'integer',
    });
    const { start, end, days, timezone } = resolveAnalyticsRange(req.query);
    const rows = await prisma.order.findMany({
      where: {
        organization_id: req.auth.organizationId,
        created_at: { gte: start, lt: end },
        ...cursorWhere(cursor),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        table_id: true,
        status: true,
        total: true,
        created_at: true,
        table: { select: { code: true } },
        order_items: {
          where: { status: 'ACTIVE' },
          select: {
            quantity: true,
            price_at_order: true,
            menu: { select: { name_en: true, name_ar: true } },
          },
        },
      },
    });
    res.json({ ...presentPage(rows, limit), range: { days, timezone } });
  } catch (err) {
    if (err?.status === 400) return sendError(res, req, err);
    console.error('Analytics export page failed:', logSafeError(err));
    return sendError(res, req, err);
  }
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
    const { limit, cursor } = resolveCursorPagination(req.query, {
      defaultLimit: 50,
      maxLimit: 100,
      idType: 'uuid',
    });
    const promos = await prisma.promotion.findMany({
      where: {
        organization_id: req.auth.organizationId,
        ...cursorWhere(cursor),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    res.json(presentPage(promos, limit));
  } catch (err) {
    if (err instanceof PaginationError) return sendError(res, req, err);
    return sendError(res, req, err);
  }
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
        data: {
          ...data,
          admin_id: req.user.id,
          organization_id: req.auth.organizationId,
        }
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
app.post('/api/upload', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const buffer = await readFile(req.file.path);
    if (!hasImageSignature(buffer, req.file.mimetype)) {
      await unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Uploaded file content does not match its image type' });
    }

    await prisma.upload.create({
      data: {
        organization_id: req.auth.organizationId,
        uploaded_by_user_id: req.auth.userId,
        filename: req.file.filename,
        original_name: req.file.originalname,
        mime_type: req.file.mimetype,
        size_bytes: req.file.size,
      },
    });

    // In prod, upload to S3 here. For now, return the tenant-owned local asset path.
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    return res.status(201).json({ url: fileUrl, filename: req.file.filename });
  } catch {
    await unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: 'Unable to store uploaded file' });
  }
});

app.delete('/api/upload/:filename', authenticate, async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (filename !== req.params.filename) return res.status(400).json({ error: 'Invalid filename' });
  try {
    const asset = await prisma.upload.findFirst({
      where: { filename, organization_id: req.auth.organizationId, deleted_at: null },
      select: { id: true, uploaded_by_user_id: true },
    });
    if (!asset) return res.status(404).json({ error: 'Upload not found' });
    if (asset.uploaded_by_user_id !== req.auth.userId
      && !['OWNER', 'MANAGER'].includes(req.auth.membershipRole)) {
      return res.status(403).json({ error: 'You do not have permission to delete this upload' });
    }

    const filepath = path.join(runtimeConfig.uploadDirectory, filename);
    await unlink(filepath).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
    await prisma.upload.delete({ where: { id: asset.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Unable to delete upload' });
  }
});

// --- Super Admin Routes ---
app.post('/api/super-admin/login', authRateLimit, async (req, res) => {
  const { email, password } = req.body;
  try {
    res.json(await superAdminAuth.beginLogin({ email, password }));
  } catch (err) {
    sendError(res, req, err);
  }
});

app.post('/api/super-admin/mfa/verify', authRateLimit, async (req, res) => {
  try {
    const { token, ...response } = await superAdminAuth.completeLogin({
      challengeToken: req.body.challengeToken,
      code: req.body.code,
      recoveryCode: req.body.recoveryCode,
    });
    res.setHeader('Set-Cookie', superAdminSessionCookie(token));
    res.json(response);
  } catch (err) {
    sendError(res, req, err);
  }
});

app.post('/api/super-admin/logout', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await superAdminAuth.revokeSessions(req.user.id);
    res.setHeader('Set-Cookie', superAdminSessionCookie('', 0));
    res.json({ success: true });
  } catch (err) {
    sendError(res, req, err);
  }
});

// Get all restaurants with subscription info
app.post(
  '/api/super-admin/restaurants',
  authenticate,
  requireSuperAdmin,
  requireRecentSuperAdmin(),
  async (req, res) => {
    try {
      const result = await restaurantInvitations.provision({
        actorSuperAdminId: req.user.id,
        ownerEmail: req.body.ownerEmail,
        restaurantName: req.body.restaurantName,
        plan: req.body.plan,
        status: req.body.status,
        subscriptionEnd: req.body.subscriptionEnd,
        trialEndsAt: req.body.trialEndsAt,
      });
      res.status(201).json({
        restaurant: {
          id: result.admin.id,
          organizationId: result.organization.id,
          ownerEmail: result.user.email,
          restaurantName: result.admin.restaurant_name,
          plan: result.admin.subscription_plan,
          status: result.admin.subscription_status,
          subscriptionEnd: result.admin.subscription_end,
          trialEndsAt: result.admin.trial_ends_at,
          maxTables: result.admin.max_tables,
          maxMenuItems: result.admin.max_menu_items,
          maxStaffAccounts: result.admin.max_staff_accounts,
        },
        invitation: {
          token: result.token,
          expiresAt: result.invitation.expires_at,
          activationPath: `/activate?token=${encodeURIComponent(result.token)}`,
        },
      });
    } catch (error) {
      if (Number(error?.status) >= 500 || !error?.status) {
        console.error('Restaurant provisioning failed:', logSafeError(error));
      }
      sendError(res, req, error);
    }
  },
);

app.post(
  '/api/super-admin/restaurants/:id/invitations',
  authenticate,
  requireSuperAdmin,
  requireRecentSuperAdmin(),
  async (req, res) => {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Valid restaurant is required' });
    try {
      const result = await restaurantInvitations.rotate({
        actorSuperAdminId: req.user.id,
        adminId: req.params.id,
      });
      res.status(201).json({
        invitation: {
          token: result.token,
          expiresAt: result.invitation.expires_at,
          activationPath: `/activate?token=${encodeURIComponent(result.token)}`,
        },
      });
    } catch (error) {
      sendError(res, req, error);
    }
  },
);

app.get('/api/super-admin/restaurants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { limit, cursor } = resolveCursorPagination(req.query, {
      defaultLimit: 25,
      maxLimit: 100,
      idType: 'uuid',
    });
    const search = String(req.query.search || '').trim();
    const plan = String(req.query.plan || 'ALL').toUpperCase();
    if (search.length > 100 || /[\u0000-\u001F\u007F]/u.test(search) ||
      !['ALL', 'STANDARD', 'BASIC', 'PRO'].includes(plan)) {
      throw new PaginationError('Restaurant pagination filter is invalid');
    }
    const filters = {
      ...(plan === 'ALL' ? {} : { subscription_plan: plan }),
      ...(search ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { restaurant_name: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const restaurants = await prisma.admin.findMany({
      where: { AND: [filters, cursorWhere(cursor)] },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
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
        organization: {
          select: {
            users: {
              where: { role: 'OWNER' },
              orderBy: { created_at: 'asc' },
              take: 1,
              select: { status: true },
            },
          },
        },
        _count: {
          select: {
            menus: { where: { deleted_at: null } },
            tables: true,
            orders: true
          }
        }
      }
    });

    const page = presentPage(restaurants, limit);
    res.json({
      ...page,
      items: page.items.map(({ organization, ...restaurant }) => ({
        ...restaurant,
        activation_status: organization?.users?.[0]?.status || 'UNKNOWN',
      })),
    });
  } catch (err) {
    if (err instanceof PaginationError) return sendError(res, req, err);
    console.error('Restaurant pagination failed:', logSafeError(err));
    return sendError(res, req, err);
  }
});

// Get platform stats
app.get('/api/super-admin/stats', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const currentAccessWhere = {
      OR: [
        {
          subscription_status: 'ACTIVE',
          OR: [{ subscription_end: null }, { subscription_end: { gt: now } }],
        },
        { subscription_status: 'TRIAL', trial_ends_at: { gt: now } },
      ],
    };
    const [totalRestaurants, activeRestaurants, activePlans, recentSignups] = await Promise.all([
      prisma.admin.count(),
      prisma.admin.count({ where: currentAccessWhere }),
      prisma.admin.groupBy({
        by: ['subscription_plan'],
        where: {
          subscription_status: 'ACTIVE',
          OR: [{ subscription_end: null }, { subscription_end: { gt: now } }],
        },
        _count: { _all: true },
      }),
      prisma.admin.count({ where: { created_at: { gte: thirtyDaysAgo } } }),
    ]);
    const planPrices = { STANDARD: 10, BASIC: 29, PRO: 79 };
    const totalRevenue = activePlans.reduce((sum, plan) => (
      sum + ((planPrices[plan.subscription_plan] || 0) * plan._count._all)
    ), 0);
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
app.put(
  '/api/super-admin/restaurants/:id/plan',
  authenticate,
  requireSuperAdmin,
  requireRecentSuperAdmin(),
  async (req, res) => {
  const { plan, status, subscription_end, trial_ends_at } = req.body;
  const restaurantId = req.params.id;
  if (!isUuid(restaurantId)) return res.status(400).json({ error: 'Valid restaurant is required' });

  try {
    const subscription = validateSubscriptionInput({
      plan,
      status: status || 'ACTIVE',
      subscriptionEnd: subscription_end,
      trialEndsAt: trial_ends_at,
    });
    const updated = await prisma.$transaction(async tx => {
      const current = await tx.admin.findUnique({ where: { id: restaurantId } });
      if (!current?.organization_id) {
        throw Object.assign(new Error('Restaurant not found'), { status: 404 });
      }
      const next = await tx.admin.update({
        where: { id: restaurantId },
        data: {
          subscription_plan: subscription.plan,
          subscription_status: subscription.status,
          subscription_end: subscription.subscriptionEnd,
          trial_ends_at: subscription.trialEndsAt,
          ...subscription.limits,
        },
        select: {
          id: true,
          organization_id: true,
          subscription_plan: true,
          subscription_status: true,
          subscription_end: true,
          trial_ends_at: true,
          max_tables: true,
          max_menu_items: true,
          max_staff_accounts: true,
        },
      });
      await tx.platformAuditEvent.create({
        data: {
          actor_super_admin_id: req.user.id,
          organization_id: current.organization_id,
          action: 'RESTAURANT_SUBSCRIPTION_CHANGED',
          entity_type: 'Admin',
          entity_id: restaurantId,
          metadata: {
            previous: {
              plan: current.subscription_plan,
              status: current.subscription_status,
              subscriptionEnd: current.subscription_end,
              trialEndsAt: current.trial_ends_at,
            },
            next: {
              plan: next.subscription_plan,
              status: next.subscription_status,
              subscriptionEnd: next.subscription_end,
              trialEndsAt: next.trial_ends_at,
            },
            requestId: req.requestId,
          },
        },
      });
      return next;
    }, { isolationLevel: 'Serializable' });

    if (!hasRestaurantAccess(updated)) {
      orderRealtime.revokeOrganization({ organizationId: updated.organization_id });
    }

    res.json(updated);
  } catch (err) {
    sendError(res, req, err);
  }
  },
);

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

app.use((req, res) => {
  res.status(404).json({ error: 'Request failed' });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err?.message?.startsWith('Only JPEG')) {
    return sendError(res, req, Object.assign(err, { status: 400 }));
  }
  if (err?.message === 'Origin not allowed by CORS') {
    return sendError(res, req, Object.assign(err, { status: 403 }));
  }
  if (!err?.status || err.status >= 500) {
    req.telemetryCaptured = true;
    captureServerException(err, {
      requestId: req.requestId,
      organizationId: req.auth?.organizationId || req.user?.organizationId || req.tableSession?.organizationId,
      method: req.method,
      path: req.path,
    });
    console.error('Unhandled request error:', logSafeError(err));
  }
  return sendError(res, req, err);
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(runtimeConfig.port, runtimeConfig.host, () => {
    console.log(JSON.stringify({
      event: 'server_started',
      host: runtimeConfig.host,
      port: runtimeConfig.port,
      release: runtimeConfig.releaseVersion,
    }));
  });

  let shuttingDown = false;
  const shutdown = signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(JSON.stringify({ event: 'server_shutdown_started', signal }));
    const forceExit = setTimeout(() => {
      console.error(JSON.stringify({ event: 'server_shutdown_forced', signal }));
      process.exit(1);
    }, runtimeConfig.shutdownTimeoutMs);
    forceExit.unref();

    io.close(async () => {
      try {
        await prisma.$disconnect();
        await flushServerTelemetry(2_000);
        clearTimeout(forceExit);
        console.info(JSON.stringify({ event: 'server_shutdown_complete', signal }));
        process.exit(0);
      } catch (error) {
        console.error('Server shutdown failed:', logSafeError(error));
        process.exit(1);
      }
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

export {
  app,
  server,
  authRateLimit,
  orderRateLimit,
  tableExchangeIpRateLimit,
  tableExchangeCapabilityRateLimit,
  tableSessionOrderRateLimit,
  organizationOrderRateLimit,
  publicOrderRejectionTelemetry,
  orderRealtime,
  runtimeConfig,
};
