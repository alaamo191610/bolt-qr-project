import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { POS_PERMISSIONS, requirePermission } from './permissions.js';
import { writeAuditEvent } from './audit.js';

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const httpError = (status, message) => Object.assign(new Error(message), { status });

const asMoney = (value, field, { allowZero = true } = {}) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) {
    throw httpError(400, `${field} must be ${allowZero ? 'zero or greater' : 'greater than zero'}`);
  }
  return amount.toFixed(2);
};

const cleanText = (value, field, max = 120) => {
  const text = String(value || '').trim();
  if (!text || text.length > max) throw httpError(400, `${field} is required and must be at most ${max} characters`);
  return text;
};

const normalizePin = value => {
  const pin = String(value || '').trim();
  if (!/^\d{4,8}$/.test(pin)) throw httpError(400, 'PIN must contain 4 to 8 digits');
  return pin;
};

const employeeTokenPayload = ({ employee, branchId, role }) => ({
  id: employee.id,
  role: 'POS_EMPLOYEE',
  organizationId: employee.organization_id,
  branchId,
  roleId: role.id,
  permissions: role.permissions,
});

const checkDetailsInclude = {
  dining_session: { select: { id: true, table_id: true, guest_count: true } },
  orders: {
    select: {
      id: true,
      order_items: {
        select: {
          id: true, menu_id: true, quantity: true, price_at_order: true, note: true,
          customizations: true, status: true, void_reason: true, voided_at: true,
          menu: { select: { name_en: true, name_ar: true } },
        },
        orderBy: { created_at: 'asc' },
      },
    },
  },
  payments: {
    select: {
      id: true, method: true, status: true, amount: true, tip: true,
      provider: true, provider_reference: true, created_at: true,
      refunds: { where: { status: 'COMPLETED' }, select: { id: true, amount: true, reason: true, created_at: true } },
    },
    orderBy: { created_at: 'asc' },
  },
};

const recalculateCheck = async (tx, { checkId, branchId, expectedVersion }) => {
  const check = await tx.check.findFirst({
    where: { id: checkId, branch_id: branchId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
    select: { id: true, version: true, paid: true },
  });
  if (!check) throw httpError(404, 'Open check not found');
  if (check.version !== expectedVersion) throw httpError(409, 'Check changed; refresh and retry');

  const orders = await tx.order.findMany({
    where: { check_id: check.id },
    select: {
      id: true,
      order_items: { where: { status: 'ACTIVE' }, select: { quantity: true, price_at_order: true } },
    },
  });
  const orderTotals = orders.map(order => ({
    id: order.id,
    subtotal: order.order_items.reduce((sum, item) => sum + Number(item.price_at_order) * Number(item.quantity || 0), 0),
  }));
  const subtotal = orderTotals.reduce((sum, order) => sum + order.subtotal, 0);
  const balance = Math.max(0, subtotal - Number(check.paid));

  await Promise.all(orderTotals.map(order => tx.order.update({
    where: { id: order.id }, data: { subtotal: order.subtotal.toFixed(2), total: order.subtotal.toFixed(2) },
  })));
  const updated = await tx.check.updateMany({
    where: { id: check.id, branch_id: branchId, version: expectedVersion },
    data: {
      subtotal: subtotal.toFixed(2), total: subtotal.toFixed(2), balance: balance.toFixed(2),
      status: balance === 0 && subtotal > 0 ? 'PAID' : Number(check.paid) > 0 ? 'PARTIALLY_PAID' : 'OPEN',
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) throw httpError(409, 'Check changed; refresh and retry');
  return tx.check.findUnique({ where: { id: check.id }, include: checkDetailsInclude });
};

const resolveItemCustomizations = (menu, body) => {
  const selectedIds = [...new Set((body.modifierOptionIds || []).map(Number).filter(Number.isInteger))];
  const removedIds = [...new Set((body.removedIngredientIds || []).map(Number).filter(Number.isInteger))];
  const availableOptionIds = new Set();
  let modifierTotal = 0;
  const modifierSnapshot = [];

  for (const link of menu.menu_modifier_groups) {
    const group = link.modifier_group;
    const selected = group.modifier_options.filter(option => selectedIds.includes(option.id));
    group.modifier_options.forEach(option => availableOptionIds.add(option.id));
    const minimum = group.required ? Math.max(1, group.min_select || 0) : group.min_select || 0;
    const maximum = group.max_select || group.modifier_options.length;
    if (selected.length < minimum || selected.length > maximum) {
      throw httpError(400, `${group.name_en} requires ${minimum}-${maximum} selections`);
    }
    if (selected.length) {
      const options = selected.map(option => {
        modifierTotal += Number(option.price_delta);
        return { id: option.id, name: option.name_en, priceDelta: Number(option.price_delta).toFixed(2) };
      });
      modifierSnapshot.push({ id: group.id, name: group.name_en, options });
    }
  }
  if (selectedIds.some(id => !availableOptionIds.has(id))) throw httpError(400, 'One or more modifier options are invalid');

  const ingredientMap = new Map(menu.menu_ingredients.map(link => [link.ingredient.id, link]));
  const removedIngredients = removedIds.map(id => {
    const link = ingredientMap.get(id);
    if (!link?.removable) throw httpError(400, 'One or more ingredients cannot be removed');
    return { id, name: link.ingredient.name_en };
  });

  return {
    unitPrice: Number(menu.price) + modifierTotal,
    snapshot: { modifiers: modifierSnapshot, removedIngredients },
  };
};

export const createPosRouter = ({ prisma, jwtSecret, authenticateAdmin, authRateLimit, io }) => {
  const router = express.Router();

  const attachAdminContext = asyncRoute(async (req, _res, next) => {
    if (req.user?.role !== 'RESTAURANT_ADMIN') throw httpError(403, 'Restaurant-admin access required');
    const admin = await prisma.admin.findUnique({
      where: { id: req.user.id },
      select: { id: true, organization_id: true, default_branch_id: true, max_staff_accounts: true },
    });
    if (!admin?.organization_id || !admin.default_branch_id) throw httpError(409, 'POS organization setup is incomplete');
    req.pos = {
      kind: 'admin',
      adminId: admin.id,
      organizationId: admin.organization_id,
      branchId: admin.default_branch_id,
      maxStaffAccounts: admin.max_staff_accounts,
    };
    next();
  });

  const authenticatePos = asyncRoute(async (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw httpError(401, 'Authentication required');

    let token;
    try {
      token = jwt.verify(authHeader.slice('Bearer '.length).trim(), jwtSecret);
    } catch {
      throw httpError(403, 'Invalid or expired token');
    }
    if (token?.role !== 'POS_EMPLOYEE' || !token.id || !token.branchId) throw httpError(403, 'Invalid POS token');

    const assignment = await prisma.employeeBranchRole.findFirst({
      where: {
        employee_id: token.id,
        branch_id: token.branchId,
        employee: { status: 'ACTIVE', organization_id: token.organizationId },
        role: { id: token.roleId, organization_id: token.organizationId },
        branch: { active: true, organization_id: token.organizationId },
      },
      select: {
        employee: { select: { id: true, display_name: true, organization_id: true } },
        branch: { select: { id: true, name: true, currency: true, timezone: true } },
        role: { select: { id: true, code: true, permissions: true } },
      },
    });
    if (!assignment) throw httpError(403, 'POS access has been revoked');

    req.pos = {
      kind: 'employee',
      employeeId: assignment.employee.id,
      employeeName: assignment.employee.display_name,
      organizationId: assignment.employee.organization_id,
      branchId: assignment.branch.id,
      branch: assignment.branch,
      roleCode: assignment.role.code,
      permissions: assignment.role.permissions,
    };
    next();
  });

  router.post('/auth/pin', authRateLimit, asyncRoute(async (req, res) => {
    const branchId = cleanText(req.body.branchId, 'branchId', 64);
    const employeeId = cleanText(req.body.employeeId, 'employeeId', 64);
    const pin = normalizePin(req.body.pin);

    const assignment = await prisma.employeeBranchRole.findFirst({
      where: {
        branch_id: branchId,
        employee_id: employeeId,
        employee: { status: 'ACTIVE' },
        branch: { active: true },
      },
      select: {
        employee: { select: { id: true, display_name: true, organization_id: true, pin_hash: true } },
        branch: { select: { id: true, name: true, currency: true, timezone: true } },
        role: { select: { id: true, code: true, name: true, permissions: true } },
      },
    });
    if (!assignment?.employee.pin_hash || !(await bcrypt.compare(pin, assignment.employee.pin_hash))) {
      throw httpError(401, 'Invalid employee or PIN');
    }

    const token = jwt.sign(employeeTokenPayload({
      employee: assignment.employee,
      branchId: assignment.branch.id,
      role: assignment.role,
    }), jwtSecret, { expiresIn: '12h' });

    res.json({
      token,
      employee: { id: assignment.employee.id, name: assignment.employee.display_name },
      branch: assignment.branch,
      role: { code: assignment.role.code, name: assignment.role.name, permissions: assignment.role.permissions },
    });
  }));

  router.get('/access/:branchId', authRateLimit, asyncRoute(async (req, res) => {
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.branchId, active: true },
      select: {
        id: true,
        name: true,
        employee_roles: {
          where: { employee: { status: 'ACTIVE', pin_hash: { not: null } } },
          select: { employee: { select: { id: true, display_name: true } } },
          distinct: ['employee_id'],
        },
      },
    });
    if (!branch) throw httpError(404, 'Branch not found');
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json({
      branch: { id: branch.id, name: branch.name },
      employees: branch.employee_roles.map(({ employee }) => ({ id: employee.id, name: employee.display_name })),
    });
  }));

  router.use('/admin', authenticateAdmin, attachAdminContext);

  router.get('/admin/setup', asyncRoute(async (req, res) => {
    const [branches, roles, employees, registers] = await Promise.all([
      prisma.branch.findMany({
        where: { organization_id: req.pos.organizationId, active: true },
        select: { id: true, code: true, name: true, currency: true, timezone: true },
        orderBy: { name: 'asc' },
      }),
      prisma.posRole.findMany({
        where: { organization_id: req.pos.organizationId },
        select: { id: true, code: true, name: true, permissions: true },
        orderBy: { name: 'asc' },
      }),
      prisma.employee.findMany({
        where: { organization_id: req.pos.organizationId },
        select: {
          id: true, display_name: true, email: true, status: true,
          branch_roles: { select: { branch_id: true, role: { select: { id: true, code: true, name: true } } } },
        },
        orderBy: { display_name: 'asc' },
      }),
      prisma.register.findMany({
        where: { branch: { organization_id: req.pos.organizationId } },
        select: { id: true, branch_id: true, code: true, name: true, active: true, device_id: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    res.json({ branches, roles, employees, registers });
  }));

  router.post('/admin/employees', asyncRoute(async (req, res) => {
    const branchId = req.body.branchId || req.pos.branchId;
    const displayName = cleanText(req.body.displayName, 'displayName');
    const pin = normalizePin(req.body.pin);
    const roleId = cleanText(req.body.roleId, 'roleId', 64);

    const [branch, role, employeeCount] = await Promise.all([
      prisma.branch.findFirst({ where: { id: branchId, organization_id: req.pos.organizationId, active: true }, select: { id: true } }),
      prisma.posRole.findFirst({ where: { id: roleId, organization_id: req.pos.organizationId }, select: { id: true } }),
      prisma.employee.count({ where: { organization_id: req.pos.organizationId, status: 'ACTIVE' } }),
    ]);
    if (!branch || !role) throw httpError(400, 'Invalid branch or role');
    if (employeeCount >= req.pos.maxStaffAccounts) throw httpError(409, 'Staff account limit reached for this plan');

    const pinHash = await bcrypt.hash(pin, 12);
    const employee = await prisma.$transaction(async tx => {
      const created = await tx.employee.create({
        data: {
          organization_id: req.pos.organizationId,
          display_name: displayName,
          email: req.body.email ? String(req.body.email).trim().toLowerCase() : null,
          pin_hash: pinHash,
          branch_roles: { create: { branch_id: branchId, role_id: roleId } },
        },
        select: { id: true, display_name: true, email: true, status: true },
      });
      await writeAuditEvent(tx, { ...req.pos, branchId }, {
        action: 'employee.created', entityType: 'employee', entityId: created.id,
      });
      return created;
    });
    res.status(201).json(employee);
  }));

  router.post('/admin/registers', asyncRoute(async (req, res) => {
    const branchId = req.body.branchId || req.pos.branchId;
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, organization_id: req.pos.organizationId, active: true }, select: { id: true },
    });
    if (!branch) throw httpError(400, 'Invalid branch');

    const register = await prisma.$transaction(async tx => {
      const created = await tx.register.create({
        data: {
          branch_id: branchId,
          code: cleanText(req.body.code, 'code', 40).toUpperCase(),
          name: cleanText(req.body.name, 'name'),
        },
      });
      await writeAuditEvent(tx, { ...req.pos, branchId }, {
        action: 'register.created', entityType: 'register', entityId: created.id,
      });
      return created;
    });
    res.status(201).json(register);
  }));

  router.use(authenticatePos);

  router.get('/bootstrap', requirePermission(POS_PERMISSIONS.READ), asyncRoute(async (req, res) => {
    const [categories, menus, tables, registers, openChecks, currentShift] = await Promise.all([
      prisma.category.findMany({
        where: { branch_id: req.pos.branchId },
        select: { id: true, name_en: true, name_ar: true, sort_order: true },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
      prisma.menu.findMany({
        where: { branch_id: req.pos.branchId, available: true, deleted_at: null },
        select: { id: true, category_id: true, name_en: true, name_ar: true, price: true, image_url: true, has_modifiers: true, tags: true },
        orderBy: { id: 'asc' },
      }),
      prisma.table.findMany({
        where: { branch_id: req.pos.branchId }, select: { id: true, code: true, capacity: true, status: true }, orderBy: { code: 'asc' },
      }),
      prisma.register.findMany({
        where: { branch_id: req.pos.branchId, active: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' },
      }),
      prisma.check.findMany({
        where: { branch_id: req.pos.branchId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
        select: { id: true, number: true, status: true, total: true, paid: true, balance: true, dining_session_id: true, version: true, opened_at: true },
        orderBy: { opened_at: 'desc' }, take: 100,
      }),
      prisma.tillShift.findFirst({
        where: { employee_id: req.pos.employeeId, status: 'OPEN', register: { branch_id: req.pos.branchId } },
        select: { id: true, register_id: true, opening_cash: true, opened_at: true },
        orderBy: { opened_at: 'desc' },
      }),
    ]);

    res.setHeader('Cache-Control', 'private, no-cache');
    res.json({
      employee: { id: req.pos.employeeId, name: req.pos.employeeName, role: req.pos.roleCode, permissions: req.pos.permissions },
      branch: req.pos.branch,
      categories, menus, tables, registers, openChecks, currentShift,
    });
  }));

  router.get('/menus/:id/options', requirePermission(POS_PERMISSIONS.READ), asyncRoute(async (req, res) => {
    const menuId = Number(req.params.id);
    if (!Number.isInteger(menuId)) throw httpError(400, 'Invalid menu item');
    const menu = await prisma.menu.findFirst({
      where: { id: menuId, branch_id: req.pos.branchId, available: true, deleted_at: null },
      select: {
        id: true, name_en: true, price: true,
        menu_modifier_groups: {
          select: {
            modifier_group: {
              select: {
                id: true, name_en: true, name_ar: true, selection_type: true,
                min_select: true, max_select: true, required: true,
                modifier_options: {
                  select: { id: true, name_en: true, name_ar: true, price_delta: true, is_default: true, max_qty: true },
                  orderBy: { id: 'asc' },
                },
              },
            },
          },
        },
        menu_ingredients: {
          where: { removable: true },
          select: { removable: true, ingredient: { select: { id: true, name_en: true, name_ar: true } } },
        },
      },
    });
    if (!menu) throw httpError(404, 'Menu item not found');
    res.json({
      id: menu.id,
      name: menu.name_en,
      price: menu.price,
      modifierGroups: menu.menu_modifier_groups.map(link => link.modifier_group),
      removableIngredients: menu.menu_ingredients.map(link => link.ingredient),
    });
  }));

  router.post('/shifts/open', requirePermission(POS_PERMISSIONS.SHIFT_OWN), asyncRoute(async (req, res) => {
    const registerId = cleanText(req.body.registerId, 'registerId', 64);
    const register = await prisma.register.findFirst({
      where: { id: registerId, branch_id: req.pos.branchId, active: true }, select: { id: true },
    });
    if (!register) throw httpError(400, 'Invalid register');

    const shift = await prisma.$transaction(async tx => {
      const created = await tx.tillShift.create({
        data: { register_id: registerId, employee_id: req.pos.employeeId, opening_cash: asMoney(req.body.openingCash ?? 0, 'openingCash') },
      });
      await writeAuditEvent(tx, req.pos, { action: 'shift.opened', entityType: 'till_shift', entityId: created.id });
      return created;
    });
    res.status(201).json(shift);
  }));

  router.post('/shifts/:id/close', requirePermission(POS_PERMISSIONS.SHIFT_OWN), asyncRoute(async (req, res) => {
    const countedCash = Number(asMoney(req.body.countedCash, 'countedCash'));
    const result = await prisma.$transaction(async tx => {
      const shift = await tx.tillShift.findFirst({
        where: { id: req.params.id, employee_id: req.pos.employeeId, status: 'OPEN', register: { branch_id: req.pos.branchId } },
        include: { cash_movements: { select: { type: true, amount: true } } },
      });
      if (!shift) throw httpError(404, 'Open shift not found');

      const cashPayments = await tx.payment.aggregate({
        where: {
          till_shift_id: shift.id,
          method: 'CASH',
          status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
        },
        _sum: { amount: true },
      });
      const movementTotal = shift.cash_movements.reduce((total, movement) => {
        const amount = Number(movement.amount);
        return total + (['PAY_OUT', 'CASH_DROP'].includes(movement.type) ? -amount : amount);
      }, 0);
      const expectedCash = Number(shift.opening_cash) + Number(cashPayments._sum.amount || 0) + movementTotal;
      const closed = await tx.tillShift.update({
        where: { id: shift.id },
        data: { status: 'CLOSED', expected_cash: expectedCash.toFixed(2), counted_cash: countedCash.toFixed(2), closed_at: new Date() },
      });
      await writeAuditEvent(tx, req.pos, {
        action: 'shift.closed', entityType: 'till_shift', entityId: shift.id,
        metadata: { expectedCash: expectedCash.toFixed(2), countedCash: countedCash.toFixed(2), variance: (countedCash - expectedCash).toFixed(2) },
      });
      return { shift: closed, variance: (countedCash - expectedCash).toFixed(2) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.json(result);
  }));

  router.post('/shifts/:id/movements', requirePermission(POS_PERMISSIONS.CASH_MANAGE), asyncRoute(async (req, res) => {
    const type = String(req.body.type || '').toUpperCase();
    if (!['PAY_IN', 'PAY_OUT', 'CASH_DROP', 'ADJUSTMENT'].includes(type)) throw httpError(400, 'Invalid cash movement type');
    const amount = asMoney(req.body.amount, 'amount', { allowZero: false });
    const reason = cleanText(req.body.reason, 'reason', 200);
    const movement = await prisma.$transaction(async tx => {
      const shift = await tx.tillShift.findFirst({
        where: { id: req.params.id, status: 'OPEN', register: { branch_id: req.pos.branchId } }, select: { id: true },
      });
      if (!shift) throw httpError(404, 'Open shift not found');
      const created = await tx.cashMovement.create({
        data: {
          till_shift_id: shift.id, employee_id: req.pos.employeeId, type, amount, reason,
          note: req.body.note ? String(req.body.note).trim().slice(0, 500) : null,
        },
      });
      await writeAuditEvent(tx, req.pos, {
        action: 'cash.movement_created', entityType: 'cash_movement', entityId: created.id,
        metadata: { shiftId: shift.id, type, amount },
      });
      return created;
    });
    res.status(201).json(movement);
  }));

  router.get('/checks', requirePermission(POS_PERMISSIONS.READ), asyncRoute(async (req, res) => {
    const status = req.query.status ? String(req.query.status).split(',') : ['OPEN', 'PARTIALLY_PAID'];
    const allowed = new Set(['OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID', 'CLOSED']);
    if (status.some(value => !allowed.has(value))) throw httpError(400, 'Invalid check status');
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const checks = await prisma.check.findMany({
      where: { branch_id: req.pos.branchId, status: { in: status } },
      include: { dining_session: { select: { table_id: true, guest_count: true } } },
      orderBy: { opened_at: 'desc' }, take: limit,
    });
    res.json(checks);
  }));

  router.post('/checks', requirePermission(POS_PERMISSIONS.CHECK_WRITE), asyncRoute(async (req, res) => {
    const guestCount = Number(req.body.guestCount ?? 1);
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 100) throw httpError(400, 'guestCount must be between 1 and 100');
    const tableId = req.body.tableId == null ? null : Number(req.body.tableId);

    const check = await prisma.$transaction(async tx => {
      if (tableId !== null) {
        const table = await tx.table.findFirst({ where: { id: tableId, branch_id: req.pos.branchId }, select: { id: true } });
        if (!table) throw httpError(400, 'Invalid table');
      }

      let session = req.body.diningSessionId ? await tx.diningSession.findFirst({
        where: { id: req.body.diningSessionId, branch_id: req.pos.branchId, status: 'OPEN' }, select: { id: true },
      }) : null;
      if (req.body.diningSessionId && !session) throw httpError(400, 'Invalid dining session');
      if (!session && tableId !== null) {
        session = await tx.diningSession.findFirst({
          where: { branch_id: req.pos.branchId, table_id: tableId, status: 'OPEN' }, select: { id: true },
        }) || await tx.diningSession.create({
          data: { branch_id: req.pos.branchId, table_id: tableId, guest_count: guestCount, opened_by_employee_id: req.pos.employeeId },
          select: { id: true },
        });
      }

      const branch = await tx.branch.update({
        where: { id: req.pos.branchId }, data: { next_check_number: { increment: 1 } },
        select: { next_check_number: true, currency: true },
      });
      const created = await tx.check.create({
        data: {
          branch_id: req.pos.branchId,
          dining_session_id: session?.id || null,
          number: branch.next_check_number - 1,
          currency: branch.currency,
          opened_by_employee_id: req.pos.employeeId,
        },
      });
      await writeAuditEvent(tx, req.pos, { action: 'check.opened', entityType: 'check', entityId: created.id, metadata: { number: created.number } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    io?.to(`branch_${req.pos.branchId}`).emit('pos:check-created', check);
    res.status(201).json(check);
  }));

  router.post('/checks/:id/items', requirePermission(POS_PERMISSIONS.CHECK_WRITE), asyncRoute(async (req, res) => {
    const menuId = Number(req.body.menuId);
    const quantity = Number(req.body.quantity ?? 1);
    const expectedVersion = Number(req.body.expectedVersion);
    if (!Number.isInteger(menuId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw httpError(400, 'menuId and quantity (1-99) are required');
    }
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw httpError(400, 'expectedVersion is required');

    const result = await prisma.$transaction(async tx => {
      const [check, menu] = await Promise.all([
        tx.check.findFirst({
          where: { id: req.params.id, branch_id: req.pos.branchId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
          select: { id: true, version: true, paid: true },
        }),
        tx.menu.findFirst({
          where: { id: menuId, branch_id: req.pos.branchId, available: true, deleted_at: null },
          select: {
            id: true, price: true,
            menu_modifier_groups: {
              select: {
                modifier_group: {
                  select: {
                    id: true, name_en: true, min_select: true, max_select: true, required: true,
                    modifier_options: { select: { id: true, name_en: true, price_delta: true } },
                  },
                },
              },
            },
            menu_ingredients: {
              select: { removable: true, ingredient: { select: { id: true, name_en: true } } },
            },
          },
        }),
      ]);
      if (!check) throw httpError(404, 'Open check not found');
      if (!menu) throw httpError(400, 'Menu item is unavailable');
      if (check.version !== expectedVersion) throw httpError(409, 'Check changed; refresh and retry');
      const customization = resolveItemCustomizations(menu, req.body);

      let order = await tx.order.findFirst({
        where: { check_id: check.id, branch_id: req.pos.branchId, source: 'POS' },
        select: { id: true }, orderBy: { id: 'asc' },
      });
      if (!order) {
        const admin = await tx.admin.findFirst({
          where: { organization_id: req.pos.organizationId }, select: { id: true }, orderBy: { created_at: 'asc' },
        });
        order = await tx.order.create({
          data: { check_id: check.id, branch_id: req.pos.branchId, admin_id: admin?.id || null, source: 'POS', type: 'dine_in', status: 'pending' },
          select: { id: true },
        });
      }

      await tx.orderItem.create({
        data: {
          order_id: order.id,
          menu_id: menu.id,
          quantity,
          price_at_order: customization.unitPrice.toFixed(2),
          note: req.body.note ? String(req.body.note).trim().slice(0, 500) : null,
          customizations: customization.snapshot,
        },
      });
      await writeAuditEvent(tx, req.pos, {
        action: 'check.item_added', entityType: 'check', entityId: check.id,
        metadata: { menuId, quantity, unitPrice: customization.unitPrice.toFixed(2) },
      });
      return recalculateCheck(tx, { checkId: check.id, branchId: req.pos.branchId, expectedVersion });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    io?.to(`branch_${req.pos.branchId}`).emit('pos:check-updated', result);
    res.status(201).json(result);
  }));

  router.patch('/checks/:checkId/items/:itemId', requirePermission(POS_PERMISSIONS.CHECK_WRITE), asyncRoute(async (req, res) => {
    const quantity = Number(req.body.quantity);
    const expectedVersion = Number(req.body.expectedVersion);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw httpError(400, 'quantity must be between 1 and 99');
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw httpError(400, 'expectedVersion is required');

    const result = await prisma.$transaction(async tx => {
      const item = await tx.orderItem.findFirst({
        where: {
          id: Number(req.params.itemId), status: 'ACTIVE',
          order: { check_id: req.params.checkId, branch_id: req.pos.branchId },
        },
        select: { id: true, quantity: true, order: { select: { check: { select: { paid: true } } } } },
      });
      if (!item) throw httpError(404, 'Active order item not found');
      if (Number(item.order?.check?.paid || 0) > 0) throw httpError(409, 'Items cannot be changed after payment has started');
      await tx.orderItem.update({ where: { id: item.id }, data: { quantity } });
      await writeAuditEvent(tx, req.pos, {
        action: 'check.item_quantity_changed', entityType: 'order_item', entityId: item.id,
        metadata: { checkId: req.params.checkId, from: item.quantity, to: quantity },
      });
      return recalculateCheck(tx, { checkId: req.params.checkId, branchId: req.pos.branchId, expectedVersion });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    io?.to(`branch_${req.pos.branchId}`).emit('pos:check-updated', result);
    res.json(result);
  }));

  router.delete('/checks/:checkId/items/:itemId', requirePermission(POS_PERMISSIONS.ITEM_VOID), asyncRoute(async (req, res) => {
    const expectedVersion = Number(req.body.expectedVersion);
    const reason = cleanText(req.body.reason, 'reason', 200);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw httpError(400, 'expectedVersion is required');

    const result = await prisma.$transaction(async tx => {
      const item = await tx.orderItem.findFirst({
        where: {
          id: Number(req.params.itemId), status: 'ACTIVE',
          order: { check_id: req.params.checkId, branch_id: req.pos.branchId },
        },
        select: { id: true, menu_id: true, quantity: true, order: { select: { check: { select: { paid: true } } } } },
      });
      if (!item) throw httpError(404, 'Active order item not found');
      if (Number(item.order?.check?.paid || 0) > 0) throw httpError(409, 'Items cannot be voided after payment has started');
      await tx.orderItem.update({
        where: { id: item.id },
        data: { status: 'VOIDED', void_reason: reason, voided_at: new Date(), voided_by_employee_id: req.pos.employeeId },
      });
      await writeAuditEvent(tx, req.pos, {
        action: 'check.item_voided', entityType: 'order_item', entityId: item.id,
        metadata: { checkId: req.params.checkId, menuId: item.menu_id, quantity: item.quantity, reason },
      });
      return recalculateCheck(tx, { checkId: req.params.checkId, branchId: req.pos.branchId, expectedVersion });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    io?.to(`branch_${req.pos.branchId}`).emit('pos:check-updated', result);
    res.json(result);
  }));

  router.post('/checks/:id/void', requirePermission(POS_PERMISSIONS.CHECK_VOID), asyncRoute(async (req, res) => {
    const reason = cleanText(req.body.reason, 'reason', 200);
    const expectedVersion = Number(req.body.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw httpError(400, 'expectedVersion is required');
    const result = await prisma.$transaction(async tx => {
      const check = await tx.check.findFirst({ where: { id: req.params.id, branch_id: req.pos.branchId, status: 'OPEN' } });
      if (!check) throw httpError(404, 'Open check not found');
      if (check.version !== expectedVersion) throw httpError(409, 'Check changed; refresh and retry');
      if (Number(check.paid) > 0) throw httpError(409, 'Paid checks must be refunded, not voided');
      const updated = await tx.check.updateMany({
        where: { id: check.id, version: expectedVersion },
        data: {
          status: 'VOID', void_reason: reason, voided_at: new Date(), closed_at: new Date(),
          closed_by_employee_id: req.pos.employeeId, version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw httpError(409, 'Check changed; refresh and retry');
      await tx.order.updateMany({ where: { check_id: check.id }, data: { status: 'cancelled' } });
      if (check.dining_session_id) {
        const remaining = await tx.check.count({
          where: { dining_session_id: check.dining_session_id, id: { not: check.id }, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
        });
        if (remaining === 0) await tx.diningSession.update({
          where: { id: check.dining_session_id }, data: { status: 'CLOSED', closed_at: new Date(), version: { increment: 1 } },
        });
      }
      await writeAuditEvent(tx, req.pos, {
        action: 'check.voided', entityType: 'check', entityId: check.id, metadata: { reason, number: check.number },
      });
      return tx.check.findUnique({ where: { id: check.id }, include: checkDetailsInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    io?.to(`branch_${req.pos.branchId}`).emit('pos:check-voided', result);
    res.json(result);
  }));

  router.get('/checks/:id', requirePermission(POS_PERMISSIONS.READ), asyncRoute(async (req, res) => {
    const check = await prisma.check.findFirst({
      where: { id: req.params.id, branch_id: req.pos.branchId }, include: checkDetailsInclude,
    });
    if (!check) throw httpError(404, 'Check not found');
    res.json(check);
  }));

  router.get('/checks/:id/receipt', requirePermission(POS_PERMISSIONS.READ), asyncRoute(async (req, res) => {
    const check = await prisma.check.findFirst({
      where: { id: req.params.id, branch_id: req.pos.branchId },
      include: {
        ...checkDetailsInclude,
        branch: { select: { name: true, timezone: true, currency: true, organization: { select: { name: true } } } },
        opened_by: { select: { display_name: true } },
        closed_by: { select: { display_name: true } },
      },
    });
    if (!check) throw httpError(404, 'Check not found');
    const refunds = check.payments.flatMap(payment => payment.refunds);
    res.json({
      receiptNumber: `${check.branch.name}-${check.number}`,
      restaurant: check.branch.organization.name,
      branch: check.branch.name,
      timezone: check.branch.timezone,
      currency: check.currency,
      check,
      totals: {
        subtotal: check.subtotal, discount: check.discount, vat: check.vat,
        serviceCharge: check.service_charge, deliveryFee: check.delivery_fee,
        tip: check.tip, total: check.total, paid: check.paid,
        refunded: refunds.reduce((sum, refund) => sum + Number(refund.amount), 0).toFixed(2),
      },
    });
  }));

  router.post('/checks/:id/payments', requirePermission(POS_PERMISSIONS.PAYMENT_WRITE), asyncRoute(async (req, res) => {
    const idempotencyKey = cleanText(req.headers['idempotency-key'], 'Idempotency-Key', 120);
    const amount = Number(asMoney(req.body.amount, 'amount', { allowZero: false }));
    const method = String(req.body.method || '').toUpperCase();
    const allowedMethods = new Set(['CASH', 'CARD', 'EXTERNAL_CARD', 'HOUSE_ACCOUNT', 'COMPLIMENTARY', 'OTHER']);
    if (!allowedMethods.has(method)) throw httpError(400, 'Invalid payment method');
    if (method === 'CARD') throw httpError(501, 'Card terminal adapter is not configured');
    if (method === 'EXTERNAL_CARD' && !String(req.body.providerReference || '').trim()) {
      throw httpError(400, 'providerReference is required for an external card payment');
    }

    const existing = await prisma.payment.findUnique({
      where: { branch_id_idempotency_key: { branch_id: req.pos.branchId, idempotency_key: idempotencyKey } },
    });
    if (existing) return res.json(existing);

    const payment = await prisma.$transaction(async tx => {
      const check = await tx.check.findFirst({
        where: { id: req.params.id, branch_id: req.pos.branchId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
      });
      if (!check) throw httpError(404, 'Open check not found');
      if (amount > Number(check.balance) + 0.0001) throw httpError(409, 'Payment exceeds check balance');

      const shift = await tx.tillShift.findFirst({
        where: { employee_id: req.pos.employeeId, status: 'OPEN', register: { branch_id: req.pos.branchId } },
        select: { id: true }, orderBy: { opened_at: 'desc' },
      });
      if (!shift) throw httpError(409, 'Open a till shift before taking payment');

      const created = await tx.payment.create({
        data: {
          branch_id: req.pos.branchId,
          check_id: check.id,
          till_shift_id: shift.id,
          captured_by_employee_id: req.pos.employeeId,
          method,
          status: 'CAPTURED',
          amount: amount.toFixed(2),
          currency: check.currency,
          idempotency_key: idempotencyKey,
          provider: req.body.provider ? String(req.body.provider).trim() : null,
          provider_reference: req.body.providerReference ? String(req.body.providerReference).trim() : null,
          metadata: req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {},
        },
      });
      const paid = Number(check.paid) + amount;
      const balance = Math.max(0, Number(check.total) - paid);
      const updated = await tx.check.updateMany({
        where: { id: check.id, branch_id: req.pos.branchId, version: check.version },
        data: { paid: paid.toFixed(2), balance: balance.toFixed(2), status: balance === 0 ? 'PAID' : 'PARTIALLY_PAID', version: { increment: 1 } },
      });
      if (updated.count !== 1) throw httpError(409, 'Check changed; refresh and retry');
      await writeAuditEvent(tx, req.pos, {
        action: 'payment.captured', entityType: 'payment', entityId: created.id,
        metadata: { checkId: check.id, method, amount: amount.toFixed(2) },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    io?.to(`branch_${req.pos.branchId}`).emit('pos:payment-captured', { checkId: req.params.id, payment });
    res.status(201).json(payment);
  }));

  router.post('/payments/:id/refunds', requirePermission(POS_PERMISSIONS.REFUND_WRITE), asyncRoute(async (req, res) => {
    const idempotencyKey = cleanText(req.headers['idempotency-key'], 'Idempotency-Key', 120);
    const amount = Number(asMoney(req.body.amount, 'amount', { allowZero: false }));
    const reason = cleanText(req.body.reason, 'reason', 300);

    const existing = await prisma.refund.findUnique({
      where: { payment_id_idempotency_key: { payment_id: req.params.id, idempotency_key: idempotencyKey } },
    });
    if (existing) return res.json(existing);

    const refund = await prisma.$transaction(async tx => {
      const payment = await tx.payment.findFirst({
        where: { id: req.params.id, branch_id: req.pos.branchId, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } },
        include: { refunds: { where: { status: 'COMPLETED' }, select: { amount: true } } },
      });
      if (!payment) throw httpError(404, 'Captured payment not found');
      if (payment.method !== 'CASH') throw httpError(501, 'This payment method requires a configured refund adapter');
      const refunded = payment.refunds.reduce((sum, item) => sum + Number(item.amount), 0);
      const refundable = Number(payment.amount) - refunded;
      if (amount > refundable + 0.0001) throw httpError(409, 'Refund exceeds the remaining refundable amount');

      const shift = await tx.tillShift.findFirst({
        where: { employee_id: req.pos.employeeId, status: 'OPEN', register: { branch_id: req.pos.branchId } },
        select: { id: true }, orderBy: { opened_at: 'desc' },
      });
      if (!shift) throw httpError(409, 'Open a till shift before issuing a cash refund');

      const created = await tx.refund.create({
        data: {
          payment_id: payment.id,
          approved_by_employee_id: req.pos.employeeId,
          status: 'COMPLETED',
          amount: amount.toFixed(2),
          reason,
          idempotency_key: idempotencyKey,
          metadata: req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {},
        },
      });
      const totalRefunded = refunded + amount;
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: totalRefunded >= Number(payment.amount) - 0.0001 ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });
      await tx.cashMovement.create({
        data: {
          till_shift_id: shift.id,
          employee_id: req.pos.employeeId,
          type: 'PAY_OUT',
          amount: amount.toFixed(2),
          reason: `Cash refund: ${reason}`,
        },
      });
      await writeAuditEvent(tx, req.pos, {
        action: 'payment.refunded', entityType: 'refund', entityId: created.id,
        metadata: { paymentId: payment.id, checkId: payment.check_id, amount: amount.toFixed(2), reason },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    io?.to(`branch_${req.pos.branchId}`).emit('pos:payment-refunded', { paymentId: req.params.id, refund });
    res.status(201).json(refund);
  }));

  router.use((err, _req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'A record with these values already exists' });
    }
    if (err?.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  });

  return router;
};
