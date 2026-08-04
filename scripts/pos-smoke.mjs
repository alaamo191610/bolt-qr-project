import jwt from 'jsonwebtoken';
import prisma from '../server/db.js';

const baseUrl = process.env.POS_API_URL || `http://localhost:${process.env.PORT || 3001}/api/pos/v1`;
const jwtSecret = process.env.JWT_SECRET;
const testPin = '2468';

if (!jwtSecret) throw new Error('JWT_SECRET is required');

const request = async (path, options = {}) => {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${body.error || 'failed'}`);
  return { body, durationMs: Math.round(performance.now() - startedAt) };
};

try {
  const admin = await prisma.admin.findFirst({
    where: { menus: { some: { available: true, deleted_at: null } }, organization_id: { not: null }, default_branch_id: { not: null } },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error('No POS-ready admin with menu items found');

  const adminToken = jwt.sign({ id: admin.id, email: admin.email, role: 'RESTAURANT_ADMIN' }, jwtSecret, { expiresIn: '5m' });
  const adminHeaders = { authorization: `Bearer ${adminToken}` };
  let setup = (await request('/admin/setup', { headers: adminHeaders })).body;
  const branch = setup.branches[0];
  const cashierRole = setup.roles.find(role => role.code === 'CASHIER');
  if (!branch || !cashierRole) throw new Error('Main branch or CASHIER role is missing');

  let register = setup.registers.find(item => item.code === 'SMOKE');
  if (!register) {
    register = (await request('/admin/registers', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ branchId: branch.id, code: 'SMOKE', name: 'Smoke Test Register' }),
    })).body;
  }

  let employee = setup.employees.find(item => item.display_name === 'POS Smoke Cashier');
  if (!employee) {
    employee = (await request('/admin/employees', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ branchId: branch.id, roleId: cashierRole.id, displayName: 'POS Smoke Cashier', pin: testPin }),
    })).body;
  }

  const login = await request('/auth/pin', {
    method: 'POST', body: JSON.stringify({ branchId: branch.id, employeeId: employee.id, pin: testPin }),
  });
  const posHeaders = { authorization: `Bearer ${login.body.token}` };
  const bootstrap = await request('/bootstrap', { headers: posHeaders });
  const menu = bootstrap.body.menus[0];
  if (!menu) throw new Error('No menu item available for the smoke check');

  let shift = bootstrap.body.currentShift;
  if (shift) {
    await request(`/shifts/${shift.id}/close`, {
      method: 'POST', headers: posHeaders, body: JSON.stringify({ countedCash: 0 }),
    });
  }
  shift = (await request('/shifts/open', {
    method: 'POST', headers: posHeaders,
    body: JSON.stringify({ registerId: register.id, openingCash: 50 }),
  })).body;

  const check = (await request('/checks', {
    method: 'POST', headers: posHeaders, body: JSON.stringify({ guestCount: 1 }),
  })).body;
  const menuOptions = menu.has_modifiers ? (await request(`/menus/${menu.id}/options`, { headers: posHeaders })).body : null;
  const requiredModifierIds = menuOptions?.modifierGroups.flatMap(group => {
    if (!group.required && !group.min_select) return [];
    const count = Math.max(1, Number(group.min_select || 0));
    const defaults = group.modifier_options.filter(option => option.is_default);
    return (defaults.length >= count ? defaults : group.modifier_options).slice(0, count).map(option => option.id);
  }) || [];
  const updatedCheck = (await request(`/checks/${check.id}/items`, {
    method: 'POST', headers: posHeaders,
    body: JSON.stringify({ menuId: menu.id, quantity: 1, expectedVersion: check.version, modifierOptionIds: requiredModifierIds }),
  })).body;
  const idempotencyKey = `smoke-${check.id}`;
  const payment = await request(`/checks/${check.id}/payments`, {
    method: 'POST', headers: { ...posHeaders, 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ method: 'CASH', amount: Number(updatedCheck.balance) }),
  });
  const replay = await request(`/checks/${check.id}/payments`, {
    method: 'POST', headers: { ...posHeaders, 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ method: 'CASH', amount: Number(updatedCheck.balance) }),
  });
  if (payment.body.id !== replay.body.id) throw new Error('Payment idempotency replay created a different payment');

  const close = await request(`/shifts/${shift.id}/close`, {
    method: 'POST', headers: posHeaders,
    body: JSON.stringify({ countedCash: 50 + Number(updatedCheck.balance) }),
  });

  console.log(JSON.stringify({
    ok: true,
    branch: branch.name,
    menuItemsLoaded: bootstrap.body.menus.length,
    bootstrapMs: bootstrap.durationMs,
    checkNumber: check.number,
    paymentIdempotent: true,
    cashVariance: close.body.variance,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
