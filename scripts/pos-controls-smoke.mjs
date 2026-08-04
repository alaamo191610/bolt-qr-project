import bcrypt from 'bcryptjs';
import prisma from '../server/db.js';

const baseUrl = process.env.POS_API_URL || `http://localhost:${process.env.PORT || 3001}/api/pos/v1`;
const managerPin = '8642';

const request = async (path, options = {}, expectedStatus = 200) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== expectedStatus) {
    throw new Error(`${options.method || 'GET'} ${path}: expected ${expectedStatus}, received ${response.status} ${body.error || ''}`);
  }
  return body;
};

try {
  const branch = await prisma.branch.findFirst({
    where: { active: true, menus: { some: { available: true, deleted_at: null } } },
    select: { id: true, organization_id: true, menus: { where: { available: true, deleted_at: null }, select: { id: true, price: true }, take: 1 } },
  });
  if (!branch?.menus[0]) throw new Error('No POS-ready branch with a menu item found');
  const role = await prisma.posRole.findFirst({ where: { organization_id: branch.organization_id, code: 'MANAGER' } });
  if (!role) throw new Error('MANAGER role not found');

  let employee = await prisma.employee.findFirst({ where: { organization_id: branch.organization_id, display_name: 'POS Smoke Manager' } });
  if (!employee) {
    employee = await prisma.employee.create({
      data: {
        organization_id: branch.organization_id,
        display_name: 'POS Smoke Manager',
        pin_hash: await bcrypt.hash(managerPin, 12),
        branch_roles: { create: { branch_id: branch.id, role_id: role.id } },
      },
    });
  }
  const register = await prisma.register.upsert({
    where: { branch_id_code: { branch_id: branch.id, code: 'SMOKE-MANAGER' } },
    create: { branch_id: branch.id, code: 'SMOKE-MANAGER', name: 'Manager Smoke Register' },
    update: { active: true },
  });

  let modifierGroup = await prisma.modifierGroup.findFirst({ where: { name_en: 'Smoke Size' }, include: { modifier_options: true } });
  if (!modifierGroup) {
    modifierGroup = await prisma.modifierGroup.create({
      data: {
        name_en: 'Smoke Size', selection_type: 'single', min_select: 1, max_select: 1, required: true,
        modifier_options: { create: [{ name_en: 'Regular', price_delta: 0 }, { name_en: 'Large', price_delta: 2 }] },
      },
      include: { modifier_options: true },
    });
  }
  await prisma.menuModifierGroup.upsert({
    where: { menu_id_group_id: { menu_id: branch.menus[0].id, group_id: modifierGroup.id } },
    create: { menu_id: branch.menus[0].id, group_id: modifierGroup.id },
    update: {},
  });
  await prisma.menu.update({ where: { id: branch.menus[0].id }, data: { has_modifiers: true } });

  const login = await request('/auth/pin', {
    method: 'POST', body: JSON.stringify({ branchId: branch.id, employeeId: employee.id, pin: managerPin }),
  });
  const headers = { authorization: `Bearer ${login.token}` };
  const bootstrap = await request('/bootstrap', { headers });
  if (bootstrap.currentShift) {
    await request(`/shifts/${bootstrap.currentShift.id}/close`, {
      method: 'POST', headers, body: JSON.stringify({ countedCash: 0 }),
    });
  }
  const shift = await request('/shifts/open', {
    method: 'POST', headers, body: JSON.stringify({ registerId: register.id, openingCash: 100 }),
  }, 201);

  const options = await request(`/menus/${branch.menus[0].id}/options`, { headers });
  const large = options.modifierGroups.flatMap(group => group.modifier_options).find(option => option.name_en === 'Large');
  if (!large) throw new Error('Large smoke modifier not returned');

  const check = await request('/checks', { method: 'POST', headers, body: JSON.stringify({ guestCount: 1 }) }, 201);
  let updated = await request(`/checks/${check.id}/items`, {
    method: 'POST', headers,
    body: JSON.stringify({ menuId: branch.menus[0].id, quantity: 1, expectedVersion: check.version, modifierOptionIds: [large.id] }),
  }, 201);
  const firstItem = updated.orders[0].order_items.find(item => item.status === 'ACTIVE');
  if (Number(firstItem.price_at_order) !== Number(branch.menus[0].price) + 2) throw new Error('Modifier price was not captured');

  updated = await request(`/checks/${check.id}/items/${firstItem.id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ quantity: 2, expectedVersion: updated.version }),
  });
  updated = await request(`/checks/${check.id}/items`, {
    method: 'POST', headers, body: JSON.stringify({ menuId: branch.menus[0].id, quantity: 1, expectedVersion: updated.version, modifierOptionIds: [large.id] }),
  }, 201);
  const secondItem = updated.orders[0].order_items.filter(item => item.status === 'ACTIVE').find(item => item.id !== firstItem.id);
  updated = await request(`/checks/${check.id}/items/${secondItem.id}`, {
    method: 'DELETE', headers, body: JSON.stringify({ expectedVersion: updated.version, reason: 'Automated void verification' }),
  });
  if (!updated.orders[0].order_items.some(item => item.id === secondItem.id && item.status === 'VOIDED')) throw new Error('Voided item history missing');

  await request(`/checks/${check.id}/payments`, {
    method: 'POST', headers: { ...headers, 'idempotency-key': `card-block-${check.id}` },
    body: JSON.stringify({ method: 'CARD', amount: 1 }),
  }, 501);

  const total = Number(updated.balance);
  const firstAmount = Number((total / 2).toFixed(2));
  const firstPayment = await request(`/checks/${check.id}/payments`, {
    method: 'POST', headers: { ...headers, 'idempotency-key': `split-a-${check.id}` },
    body: JSON.stringify({ method: 'CASH', amount: firstAmount }),
  }, 201);
  await request(`/checks/${check.id}/payments`, {
    method: 'POST', headers: { ...headers, 'idempotency-key': `split-b-${check.id}` },
    body: JSON.stringify({ method: 'CASH', amount: Number((total - firstAmount).toFixed(2)) }),
  }, 201);

  const refund = await request(`/payments/${firstPayment.id}/refunds`, {
    method: 'POST', headers: { ...headers, 'idempotency-key': `refund-${firstPayment.id}` },
    body: JSON.stringify({ amount: 1, reason: 'Automated refund verification' }),
  }, 201);
  const replay = await request(`/payments/${firstPayment.id}/refunds`, {
    method: 'POST', headers: { ...headers, 'idempotency-key': `refund-${firstPayment.id}` },
    body: JSON.stringify({ amount: 1, reason: 'Automated refund verification' }),
  });
  if (refund.id !== replay.id) throw new Error('Refund idempotency replay created a different refund');

  const receipt = await request(`/checks/${check.id}/receipt`, { headers });
  if (Number(receipt.totals.refunded) !== 1) throw new Error('Receipt refund total is incorrect');

  const voidCheck = await request('/checks', { method: 'POST', headers, body: JSON.stringify({ guestCount: 1 }) }, 201);
  const voided = await request(`/checks/${voidCheck.id}/void`, {
    method: 'POST', headers, body: JSON.stringify({ expectedVersion: voidCheck.version, reason: 'Automated check void verification' }),
  });
  if (voided.status !== 'VOID') throw new Error('Check void failed');

  const close = await request(`/shifts/${shift.id}/close`, {
    method: 'POST', headers, body: JSON.stringify({ countedCash: Number((100 + total - 1).toFixed(2)) }),
  });
  if (Number(close.variance) !== 0) throw new Error(`Till variance expected 0, received ${close.variance}`);

  console.log(JSON.stringify({
    ok: true,
    modifierPriceCaptured: true,
    quantityUpdated: true,
    voidHistoryPreserved: true,
    unsafeCardCaptureBlocked: true,
    splitTenderCaptured: true,
    refundIdempotent: true,
    receiptRefundTotal: receipt.totals.refunded,
    checkVoidAudited: true,
    cashVariance: close.variance,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
