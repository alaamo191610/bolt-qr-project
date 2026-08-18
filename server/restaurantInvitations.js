import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { planLimits, validateSubscriptionInput } from './subscriptionPolicy.js';

export const RESTAURANT_INVITATION_TTL_MS = 48 * 60 * 60 * 1_000;
const INVITATION_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const generateRestaurantInvitationToken = () => randomBytes(32).toString('base64url');
export const hashRestaurantInvitationToken = token => createHash('sha256')
  .update(String(token || ''), 'utf8')
  .digest('hex');
export const isRestaurantInvitationToken = token => typeof token === 'string'
  && INVITATION_PATTERN.test(token);

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const normalizeName = value => String(value || '').trim();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_CURRENCY = 'JOD';

const slugFor = name => {
  const base = name.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'restaurant';
  return `${base}-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
};

const invalidInvitation = () => Object.assign(new Error('Invitation is invalid or expired'), {
  status: 400,
  code: 'INVITATION_INVALID',
});

export const createRestaurantInvitationService = ({
  db,
  clock = () => new Date(),
  invitationTtlMs = RESTAURANT_INVITATION_TTL_MS,
  passwordCost = 10,
}) => {
  if (!db) throw new Error('Restaurant invitation database is required');

  const provision = async ({ actorSuperAdminId, ownerEmail, restaurantName, plan, status, subscriptionEnd, trialEndsAt }) => {
    const email = normalizeEmail(ownerEmail);
    const name = normalizeName(restaurantName);
    if (!emailPattern.test(email) || email.length > 254) {
      throw Object.assign(new Error('A valid owner email is required'), { status: 400 });
    }
    if (name.length < 2 || name.length > 120) {
      throw Object.assign(new Error('Restaurant name must contain 2 to 120 characters'), { status: 400 });
    }
    const now = clock();
    const subscription = validateSubscriptionInput({
      plan,
      status,
      subscriptionEnd,
      trialEndsAt,
      now,
      allowInactive: false,
    });
    const token = generateRestaurantInvitationToken();
    const tokenHash = hashRestaurantInvitationToken(token);
    const expiresAt = new Date(now.getTime() + invitationTtlMs);

    try {
      const result = await db.$transaction(async tx => {
        const organization = await tx.organization.create({
          data: { name, slug: slugFor(name) },
        });
        const branch = await tx.branch.create({
          data: {
            organization_id: organization.id,
            code: 'MAIN',
            name: 'Main Branch',
            timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Amman',
            currency: DEFAULT_CURRENCY,
          },
        });
        const user = await tx.user.create({
          data: { email, name, active: false, password_hash: null },
        });
        await tx.organizationUser.create({
          data: {
            organization_id: organization.id,
            user_id: user.id,
            default_branch_id: branch.id,
            role: 'OWNER',
            status: 'INVITED',
          },
        });
        const admin = await tx.admin.create({
          data: {
            organization_id: organization.id,
            default_branch_id: branch.id,
            email,
            restaurant_name: name,
            subscription_plan: subscription.plan,
            subscription_status: subscription.status,
            subscription_end: subscription.subscriptionEnd,
            trial_ends_at: subscription.trialEndsAt,
            pricing_prefs: {
              baseCurrency: DEFAULT_CURRENCY,
              enabledCurrencies: [DEFAULT_CURRENCY],
              exchangeRates: { JOD: 1, USD: 0, QAR: 0, SAR: 0 },
              priceDisplay: 'symbol',
              rounding: 'none',
              taxInclusive: true,
            },
            ...subscription.limits,
          },
        });
        const invitation = await tx.restaurantInvitation.create({
          data: {
            organization_id: organization.id,
            user_id: user.id,
            created_by_super_admin_id: actorSuperAdminId,
            email,
            token_hash: tokenHash,
            expires_at: expiresAt,
          },
        });
        await tx.platformAuditEvent.create({
          data: {
            actor_super_admin_id: actorSuperAdminId,
            organization_id: organization.id,
            action: 'RESTAURANT_PROVISIONED',
            entity_type: 'Admin',
            entity_id: admin.id,
            metadata: {
              plan: subscription.plan,
              status: subscription.status,
              invitationId: invitation.id,
            },
          },
        });
        return { organization, branch, user, admin, invitation };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      return { ...result, token };
    } catch (error) {
      if (error?.code === 'P2002') {
        throw Object.assign(new Error('An account with this email already exists'), { status: 409 });
      }
      throw error;
    }
  };

  const rotate = async ({ actorSuperAdminId, adminId }) => {
    const now = clock();
    const token = generateRestaurantInvitationToken();
    const expiresAt = new Date(now.getTime() + invitationTtlMs);
    const tokenHash = hashRestaurantInvitationToken(token);
    const result = await db.$transaction(async tx => {
      const admin = await tx.admin.findUnique({
        where: { id: adminId },
        select: {
          id: true,
          organization_id: true,
          email: true,
          organization: {
            select: {
              users: {
                where: { role: 'OWNER', status: 'INVITED' },
                select: { user_id: true },
                take: 1,
              },
            },
          },
        },
      });
      const owner = admin?.organization?.users?.[0];
      if (!admin?.organization_id || !owner) {
        throw Object.assign(new Error('Restaurant has no pending owner invitation'), { status: 409 });
      }
      await tx.restaurantInvitation.updateMany({
        where: {
          organization_id: admin.organization_id,
          used_at: null,
          revoked_at: null,
        },
        data: { revoked_at: now },
      });
      const invitation = await tx.restaurantInvitation.create({
        data: {
          organization_id: admin.organization_id,
          user_id: owner.user_id,
          created_by_super_admin_id: actorSuperAdminId,
          email: admin.email,
          token_hash: tokenHash,
          expires_at: expiresAt,
        },
      });
      await tx.platformAuditEvent.create({
        data: {
          actor_super_admin_id: actorSuperAdminId,
          organization_id: admin.organization_id,
          action: 'RESTAURANT_INVITATION_ROTATED',
          entity_type: 'RestaurantInvitation',
          entity_id: invitation.id,
          metadata: { adminId },
        },
      });
      return invitation;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { invitation: result, token };
  };

  const activate = async ({ token, password }) => {
    if (!isRestaurantInvitationToken(token) || typeof password !== 'string' || password.length < 12) {
      if (typeof password === 'string' && password.length < 12) {
        throw Object.assign(new Error('Password must be at least 12 characters'), { status: 400 });
      }
      throw invalidInvitation();
    }
    const now = clock();
    const tokenHash = hashRestaurantInvitationToken(token);
    const passwordHash = await bcrypt.hash(password, passwordCost);

    try {
      return await db.$transaction(async tx => {
      const invitation = await tx.restaurantInvitation.findUnique({
        where: { token_hash: tokenHash },
        select: {
          id: true,
          organization_id: true,
          user_id: true,
          expires_at: true,
          used_at: true,
          revoked_at: true,
        },
      });
      if (!invitation || invitation.used_at || invitation.revoked_at || invitation.expires_at <= now) {
        throw invalidInvitation();
      }
      const claimed = await tx.restaurantInvitation.updateMany({
        where: {
          id: invitation.id,
          used_at: null,
          revoked_at: null,
          expires_at: { gt: now },
        },
        data: { used_at: now },
      });
      if (claimed.count !== 1) throw invalidInvitation();

      await tx.user.update({
        where: { id: invitation.user_id },
        data: { password_hash: passwordHash, active: true },
      });
      await tx.organizationUser.update({
        where: {
          organization_id_user_id: {
            organization_id: invitation.organization_id,
            user_id: invitation.user_id,
          },
        },
        data: { status: 'ACTIVE' },
      });
      const currentAdmin = await tx.admin.findFirst({
        where: { organization_id: invitation.organization_id },
        orderBy: { created_at: 'asc' },
        select: { id: true },
      });
      if (!currentAdmin) throw invalidInvitation();
      const admin = await tx.admin.update({
        where: { id: currentAdmin.id },
        data: { password: passwordHash },
        select: { id: true, email: true, restaurant_name: true },
      });
      await tx.platformAuditEvent.create({
        data: {
          organization_id: invitation.organization_id,
          action: 'RESTAURANT_INVITATION_ACCEPTED',
          entity_type: 'RestaurantInvitation',
          entity_id: invitation.id,
          metadata: { adminId: admin.id },
        },
      });
      return admin;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error?.code === 'P2034' || error?.code === 'P2025') throw invalidInvitation();
      throw error;
    }
  };

  return { provision, rotate, activate };
};

export { planLimits };
