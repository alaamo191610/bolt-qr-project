import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createTestDatabase } from '../helpers/testDatabase.js';
import { runTenantOwnershipVerification } from '../../server/prisma/verification/runTenantOwnershipVerification.js';

let database;
let applicationDatabase;
let app;
let httpServer;
let baseUrl;
let tenantA;
let tenantB;
let rateLimiters;
let rejectionTelemetry;

const postJson = async (path, body) => fetch(`${baseUrl}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const authenticatedRequest = (token, path, init = {}) => fetch(`${baseUrl}${path}`, {
  ...init,
  headers: {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
    ...(init.headers || {}),
  },
});

const createTenantFixture = async (label) => {
  const id = randomUUID();
  const branchId = randomUUID();
  const userId = randomUUID();
  const adminId = randomUUID();
  const password = `Fixture-${label}-password!`;
  const passwordHash = await bcrypt.hash(password, 4);

  const organization = await database.prisma.organization.create({
    data: { id, name: `Fixture ${label}`, slug: `fixture-${label.toLowerCase()}-${id.slice(0, 8)}` },
  });
  await database.prisma.branch.create({
    data: { id: branchId, organization_id: organization.id, code: 'MAIN', name: 'Main Branch' },
  });
  const admin = await database.prisma.admin.create({
    data: {
      id: adminId,
      organization_id: organization.id,
      default_branch_id: branchId,
      email: `admin-${label.toLowerCase()}-${id.slice(0, 8)}@example.com`,
      password: passwordHash,
      restaurant_name: `Fixture ${label}`,
    },
  });
  const user = await database.prisma.user.create({
    data: {
      id: userId,
      email: `user-${label.toLowerCase()}-${id.slice(0, 8)}@example.com`,
      password_hash: passwordHash,
      name: `User ${label}`,
    },
  });
  await database.prisma.organizationUser.create({
    data: {
      organization_id: organization.id,
      user_id: user.id,
      default_branch_id: branchId,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });
  const category = await database.prisma.category.create({
    data: {
      admin_id: admin.id,
      organization_id: organization.id,
      branch_id: branchId,
      name_en: `${label} Category`,
    },
  });
  const menu = await database.prisma.menu.create({
    data: {
      user_id: admin.id,
      organization_id: organization.id,
      branch_id: branchId,
      category_id: category.id,
      name_en: `${label} Menu Item`,
      price: 10,
      tags: [],
      suggested_items_ids: [],
    },
  });
  const ingredient = await database.prisma.ingredient.create({
    data: {
      admin_id: admin.id,
      organization_id: organization.id,
      branch_id: branchId,
      name_en: `${label} Ingredient`,
    },
  });
  await database.prisma.menuIngredient.create({
    data: { menu_id: menu.id, ingredient_id: ingredient.id },
  });
  const table = await database.prisma.table.create({
    data: {
      admin_id: admin.id,
      organization_id: organization.id,
      branch_id: branchId,
      code: `${label.toUpperCase()}-01`,
    },
  });
  const promotion = await database.prisma.promotion.create({
    data: {
      admin_id: admin.id,
      organization_id: organization.id,
      branch_id: branchId,
      code: `${label.toUpperCase()}10`,
      value: 10,
    },
  });
  const order = await database.prisma.order.create({
    data: {
      admin_id: admin.id,
      organization_id: organization.id,
      branch_id: branchId,
      table_id: table.id,
      promotion_id: promotion.id,
      subtotal: 10,
      total: 10,
    },
  });
  const modifierGroup = await database.prisma.modifierGroup.create({
    data: {
      organization_id: organization.id,
      name_en: `${label} Modifier Group`,
    },
  });
  await database.prisma.menuModifierGroup.create({
    data: { menu_id: menu.id, group_id: modifierGroup.id },
  });

  return {
    organization,
    branchId,
    admin,
    user,
    category,
    menu,
    ingredient,
    table,
    promotion,
    order,
    modifierGroup,
    password,
  };
};

const createTableSession = async tenant => {
  const login = await postJson('/api/auth/login', {
    email: tenant.user.email,
    password: tenant.password,
  });
  const { token: adminToken } = await login.json();
  const rotation = await authenticatedRequest(
    adminToken,
    `/api/tables/${tenant.table.id}/capability/rotate`,
    { method: 'POST' },
  );
  const { capability } = await rotation.json();
  const exchange = await postJson('/api/public/table-session', { capability });
  const session = await exchange.json();
  assert.equal(exchange.status, 200);
  return { adminToken, capability, session };
};

before(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.databaseUrl;
  const application = await import(`../../server/index.js?integration=${Date.now()}`);
  ({ app } = application);
  rejectionTelemetry = application.publicOrderRejectionTelemetry;
  rateLimiters = [
    application.orderRateLimit,
    application.tableExchangeIpRateLimit,
    application.tableExchangeCapabilityRateLimit,
    application.tableSessionOrderRateLimit,
    application.organizationOrderRateLimit,
  ];
  ({ default: applicationDatabase } = await import('../../server/db.js'));
  httpServer = createServer(app);
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

beforeEach(async () => {
  await database.reset();
  for (const limiter of rateLimiters) limiter.reset();
  tenantA = await createTenantFixture('Alpha');
  tenantB = await createTenantFixture('Beta');
});

after(async () => {
  await new Promise((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
  await applicationDatabase.$disconnect();
  await database.close();
});

test('authentication resolves the active tenant and rejects cross-tenant organization selection', async () => {
  const login = await postJson('/api/auth/login', {
    email: tenantA.user.email,
    password: tenantA.password,
  });
  const loginBody = await login.json();

  assert.equal(login.status, 200);
  assert.equal(loginBody.user.organizationId, tenantA.organization.id);
  assert.equal(loginBody.user.identityId, tenantA.user.id);
  assert.ok(loginBody.token);

  const crossTenantLogin = await postJson('/api/auth/login', {
    email: tenantA.user.email,
    password: tenantA.password,
    organizationId: tenantB.organization.id,
  });
  const crossTenantBody = await crossTenantLogin.json();

  assert.equal(crossTenantLogin.status, 403);
  assert.equal(crossTenantBody.code, 'ACCESS_DENIED');
  assert.equal(crossTenantBody.requestId, crossTenantLogin.headers.get('x-request-id'));
});

test('tenant-scoped reads and writes fail closed for another tenant', async () => {
  const login = await postJson('/api/auth/login', {
    email: tenantA.user.email,
    password: tenantA.password,
  });
  const { token } = await login.json();

  const menus = await authenticatedRequest(token, '/api/menus');
  const menuBody = await menus.json();
  assert.equal(menus.status, 200);
  assert.deepEqual(menuBody.map(item => item.id), [tenantA.menu.id]);

  const attemptedUpdate = await authenticatedRequest(token, `/api/menus/${tenantB.menu.id}`, {
    method: 'PUT',
    body: JSON.stringify({ name_en: 'Cross-tenant mutation' }),
  });
  const updateBody = await attemptedUpdate.json();
  assert.equal(attemptedUpdate.status, 404);
  assert.equal(updateBody.code, 'VALIDATION_ERROR');

  const betaMenu = await database.prisma.menu.findUnique({ where: { id: tenantB.menu.id } });
  assert.equal(betaMenu.name_en, 'Beta Menu Item');

  const categories = await authenticatedRequest(token, '/api/categories');
  const categoryBody = await categories.json();
  assert.equal(categories.status, 200);
  assert.deepEqual(categoryBody.map(category => category.id), [tenantA.category.id]);

  const createdCategoryResponse = await authenticatedRequest(token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name_en: 'Alpha Created Category' }),
  });
  const createdCategory = await createdCategoryResponse.json();
  assert.equal(createdCategoryResponse.status, 201);
  assert.equal(createdCategory.organization_id, tenantA.organization.id);

  const createdMenuResponse = await authenticatedRequest(token, '/api/menus', {
    method: 'POST',
    body: JSON.stringify({
      name_en: 'Alpha Created Menu',
      price: 8.5,
      category_id: createdCategory.id,
      available: true,
    }),
  });
  const createdMenu = await createdMenuResponse.json();
  assert.equal(createdMenuResponse.status, 201);
  assert.equal(createdMenu.organization_id, tenantA.organization.id);

  const createdTableResponse = await authenticatedRequest(token, '/api/tables', {
    method: 'POST',
    body: JSON.stringify({ code: 'ALPHA-99', capacity: 2 }),
  });
  const createdTable = await createdTableResponse.json();
  assert.equal(createdTableResponse.status, 200);
  assert.equal(createdTable.organization_id, tenantA.organization.id);

  const createdModifierResponse = await authenticatedRequest(
    token,
    `/api/menus/${createdMenu.id}/modifiers`,
    {
      method: 'POST',
      body: JSON.stringify({
        groups: [{
          name_en: 'Alpha Created Modifier',
          selection_type: 'single',
          options: [],
        }],
      }),
    },
  );
  assert.equal(createdModifierResponse.status, 200);
  const createdModifier = await database.prisma.modifierGroup.findFirst({
    where: {
      name_en: 'Alpha Created Modifier',
      organization_id: tenantA.organization.id,
    },
  });
  assert.ok(createdModifier);
});

test('cross-tenant links and destructive mutations are denied for every exposed root', async () => {
  const login = await postJson('/api/auth/login', {
    email: tenantA.user.email,
    password: tenantA.password,
  });
  const { token } = await login.json();

  const categoryLink = await authenticatedRequest(token, '/api/menus', {
    method: 'POST',
    body: JSON.stringify({
      name_en: 'Invalid Category Link',
      price: 5,
      category_id: tenantB.category.id,
      available: true,
    }),
  });
  assert.equal(categoryLink.status, 400);

  const ingredientLink = await authenticatedRequest(token, `/api/menus/${tenantA.menu.id}/ingredients`, {
    method: 'POST',
    body: JSON.stringify({ ingredients: [{ ingredient_id: tenantB.ingredient.id }] }),
  });
  assert.equal(ingredientLink.status, 400);

  const modifierLink = await authenticatedRequest(token, `/api/menus/${tenantA.menu.id}/modifiers`, {
    method: 'POST',
    body: JSON.stringify({ groups: [{ id: tenantB.modifierGroup.id, name_en: 'Cross-tenant' }] }),
  });
  assert.equal(modifierLink.status, 404);

  const menuDelete = await authenticatedRequest(token, `/api/menus/${tenantB.menu.id}`, {
    method: 'DELETE',
  });
  assert.equal(menuDelete.status, 404);

  const tableDelete = await authenticatedRequest(token, `/api/tables/${tenantB.table.id}`, {
    method: 'DELETE',
  });
  assert.equal(tableDelete.status, 404);

  const orderUpdate = await authenticatedRequest(token, `/api/orders/${tenantB.order.id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'preparing' }),
  });
  assert.equal(orderUpdate.status, 404);

  const promotionUpdate = await authenticatedRequest(
    token,
    `/api/promotions/${tenantB.promotion.id}/active`,
    {
      method: 'PUT',
      body: JSON.stringify({ active: false }),
    },
  );
  assert.equal(promotionUpdate.status, 404);

  const [betaMenu, betaTable, betaOrder, betaPromotion, betaModifier] = await Promise.all([
    database.prisma.menu.findUnique({ where: { id: tenantB.menu.id } }),
    database.prisma.table.findUnique({ where: { id: tenantB.table.id } }),
    database.prisma.order.findUnique({ where: { id: tenantB.order.id } }),
    database.prisma.promotion.findUnique({ where: { id: tenantB.promotion.id } }),
    database.prisma.modifierGroup.findUnique({ where: { id: tenantB.modifierGroup.id } }),
  ]);
  assert.ok(betaMenu);
  assert.ok(betaTable);
  assert.equal(betaOrder.status, 'pending');
  assert.equal(betaPromotion.active, true);
  assert.equal(betaModifier.name_en, 'Beta Modifier Group');
});

test('takeaway ordering is disabled for Release 1 without creating an order', async () => {
  const beforeCount = await database.prisma.order.count({
    where: { organization_id: tenantA.organization.id },
  });
  const response = await postJson('/api/orders', {
    adminId: tenantA.admin.id,
    type: 'take_away',
    items: [{ menuId: tenantA.menu.id, quantity: 1 }],
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.code, 'ORDER_TYPE_DISABLED');
  assert.equal(body.error, 'Takeaway ordering is disabled for Release 1');
  assert.equal(
    await database.prisma.order.count({ where: { organization_id: tenantA.organization.id } }),
    beforeCount,
  );
});

test('table capability exchange authorizes dine-in identity and ignores body tenant identifiers', async () => {
  const login = await postJson('/api/auth/login', {
    email: tenantA.user.email,
    password: tenantA.password,
  });
  const { token: adminToken } = await login.json();
  const rotation = await authenticatedRequest(
    adminToken,
    `/api/tables/${tenantA.table.id}/capability/rotate`,
    { method: 'POST' },
  );
  const rotated = await rotation.json();

  assert.equal(rotation.status, 200);
  assert.equal(rotated.capability.length, 43);
  const stored = await database.prisma.tableCapability.findUnique({
    where: { table_id: tenantA.table.id },
  });
  assert.match(stored.secret_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(stored.secret_hash, rotated.capability);

  const exchange = await postJson('/api/public/table-session', {
    capability: rotated.capability,
  });
  const session = await exchange.json();
  assert.equal(exchange.status, 200);
  assert.equal(session.expiresIn, 1800);
  assert.equal(session.organizationId, tenantA.organization.id);
  assert.equal(session.restaurantId, tenantA.admin.id);
  assert.deepEqual(session.table, { id: tenantA.table.id, code: tenantA.table.code });

  const order = await authenticatedRequest(session.token, '/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      type: 'dine_in',
      adminId: tenantB.admin.id,
      tableCode: tenantB.table.code,
      items: [{ menuId: tenantA.menu.id, quantity: 1 }],
    }),
  });
  const created = await order.json();

  assert.equal(order.status, 201);
  assert.equal(created.admin_id, tenantA.admin.id);
  assert.equal(created.organization_id, tenantA.organization.id);
  assert.equal(created.branch_id, tenantA.branchId);
  assert.equal(created.table_id, tenantA.table.id);
});

test('dine-in order idempotency requires a bounded key before mutation', async () => {
  const { session } = await createTableSession(tenantA);
  const beforeCount = await database.prisma.order.count();
  const requestBody = JSON.stringify({
    type: 'dine_in',
    items: [{ menuId: tenantA.menu.id, quantity: 1 }],
  });

  const missing = await authenticatedRequest(session.token, '/api/orders', {
    method: 'POST',
    body: requestBody,
  });
  const missingBody = await missing.json();
  assert.equal(missing.status, 400);
  assert.equal(missingBody.code, 'IDEMPOTENCY_KEY_REQUIRED');

  const malformed = await authenticatedRequest(session.token, '/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'not safe' },
    body: requestBody,
  });
  const malformedBody = await malformed.json();
  assert.equal(malformed.status, 400);
  assert.equal(malformedBody.code, 'VALIDATION_ERROR');
  assert.equal(await database.prisma.order.count(), beforeCount);
});

test('same idempotency key and payload replays one order and one promotion increment', async () => {
  const { session } = await createTableSession(tenantA);
  const key = randomUUID();
  const beforeCount = await database.prisma.order.count();
  const request = {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      type: 'dine_in',
      promotionCode: tenantA.promotion.code,
      items: [{ menuId: tenantA.menu.id, quantity: 1 }],
    }),
  };

  const first = await authenticatedRequest(session.token, '/api/orders', request);
  const firstBody = await first.json();
  const replay = await authenticatedRequest(session.token, '/api/orders', request);
  const replayBody = await replay.json();

  assert.equal(first.status, 201);
  assert.equal(first.headers.get('idempotency-replayed'), 'false');
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get('idempotency-replayed'), 'true');
  assert.equal(replayBody.id, firstBody.id);
  assert.equal(await database.prisma.order.count(), beforeCount + 1);
  const promotion = await database.prisma.promotion.findUnique({ where: { id: tenantA.promotion.id } });
  assert.equal(promotion.times_used, 1);
  const record = await database.prisma.publicOrderIdempotency.findFirst({ where: { key } });
  assert.equal(record.order_id, firstBody.id);
  assert.ok(record.expires_at.getTime() - record.created_at.getTime() >= 24 * 60 * 60 * 1000 - 1000);
});

test('same idempotency key with a changed payload returns a stable conflict without mutation', async () => {
  const { session } = await createTableSession(tenantA);
  const key = randomUUID();
  const first = await authenticatedRequest(session.token, '/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      type: 'dine_in',
      items: [{ menuId: tenantA.menu.id, quantity: 1 }],
    }),
  });
  const firstBody = await first.json();

  const changed = await authenticatedRequest(session.token, '/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      type: 'dine_in',
      items: [{ menuId: tenantA.menu.id, quantity: 2 }],
    }),
  });
  const changedBody = await changed.json();

  assert.equal(first.status, 201);
  assert.equal(changed.status, 409);
  assert.equal(changedBody.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(await database.prisma.publicOrderIdempotency.count({ where: { key } }), 1);
  assert.equal((await database.prisma.publicOrderIdempotency.findFirst({ where: { key } })).order_id, firstBody.id);
});

test('failed order mutation rolls back its idempotency reservation so the key remains usable', async () => {
  const { session } = await createTableSession(tenantA);
  const key = randomUUID();
  const beforeCount = await database.prisma.order.count();
  const submit = menuId => authenticatedRequest(session.token, '/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      type: 'dine_in',
      items: [{ menuId, quantity: 1 }],
    }),
  });

  const rejected = await submit(2_147_483_647);
  assert.equal(rejected.status, 400);
  assert.equal(await database.prisma.order.count(), beforeCount);
  assert.equal(await database.prisma.publicOrderIdempotency.count({ where: { key } }), 0);

  const accepted = await submit(tenantA.menu.id);
  assert.equal(accepted.status, 201);
  assert.equal(await database.prisma.order.count(), beforeCount + 1);
  assert.equal(await database.prisma.publicOrderIdempotency.count({ where: { key } }), 1);
});

test('concurrent duplicate submissions serialize to one order and one promotion mutation', async () => {
  const { session } = await createTableSession(tenantA);
  const key = randomUUID();
  const beforeCount = await database.prisma.order.count();
  const request = () => authenticatedRequest(session.token, '/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      type: 'dine_in',
      promotionCode: tenantA.promotion.code,
      items: [{ menuId: tenantA.menu.id, quantity: 1 }],
    }),
  });

  const responses = await Promise.all([request(), request()]);
  const bodies = await Promise.all(responses.map(response => response.json()));

  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  assert.equal(bodies[0].id, bodies[1].id);
  assert.equal(await database.prisma.order.count(), beforeCount + 1);
  assert.equal(
    (await database.prisma.promotion.findUnique({ where: { id: tenantA.promotion.id } })).times_used,
    1,
  );
});

test('idempotency keys are isolated by capability scope and may be reused after 24-hour expiry', async () => {
  const alpha = await createTableSession(tenantA);
  const beta = await createTableSession(tenantB);
  const key = randomUUID();
  const createFor = (tenant, session) => authenticatedRequest(session.token, '/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      type: 'dine_in',
      items: [{ menuId: tenant.menu.id, quantity: 1 }],
    }),
  });

  const alphaFirst = await createFor(tenantA, alpha.session);
  const betaFirst = await createFor(tenantB, beta.session);
  assert.equal(alphaFirst.status, 201);
  assert.equal(betaFirst.status, 201);
  assert.equal(await database.prisma.publicOrderIdempotency.count({ where: { key } }), 2);

  const alphaRecord = await database.prisma.publicOrderIdempotency.findFirst({
    where: { key, organization_id: tenantA.organization.id },
  });
  const oldCreatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
  await database.prisma.publicOrderIdempotency.update({
    where: { id: alphaRecord.id },
    data: { created_at: oldCreatedAt, expires_at: new Date(oldCreatedAt.getTime() + 24 * 60 * 60 * 1000) },
  });

  const alphaAfterExpiry = await createFor(tenantA, alpha.session);
  const alphaAfterExpiryBody = await alphaAfterExpiry.json();
  assert.equal(alphaAfterExpiry.status, 201);
  assert.notEqual(alphaAfterExpiryBody.id, (await alphaFirst.json()).id);
  assert.equal(
    await database.prisma.publicOrderIdempotency.count({
      where: { key, organization_id: tenantA.organization.id },
    }),
    1,
  );
});

test('capability rotation starts a new idempotency version scope', async () => {
  const first = await createTableSession(tenantA);
  const key = randomUUID();
  const submit = session => authenticatedRequest(session.token, '/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      type: 'dine_in',
      items: [{ menuId: tenantA.menu.id, quantity: 1 }],
    }),
  });

  const firstResponse = await submit(first.session);
  const firstOrder = await firstResponse.json();
  assert.equal(firstResponse.status, 201);

  const rotation = await authenticatedRequest(
    first.adminToken,
    `/api/tables/${tenantA.table.id}/capability/rotate`,
    { method: 'POST' },
  );
  const { capability } = await rotation.json();
  const exchange = await postJson('/api/public/table-session', { capability });
  const secondSession = await exchange.json();
  const secondResponse = await submit(secondSession);
  const secondOrder = await secondResponse.json();

  assert.equal(secondResponse.status, 201);
  assert.notEqual(secondOrder.id, firstOrder.id);
  const records = await database.prisma.publicOrderIdempotency.findMany({
    where: { key, organization_id: tenantA.organization.id },
    orderBy: { capability_version: 'asc' },
  });
  assert.equal(records.length, 2);
  assert.notEqual(records[0].capability_version, records[1].capability_version);
});

test('a table session permits three open orders, replays at capacity, and releases terminal capacity', async () => {
  const { session } = await createTableSession(tenantA);
  const submit = key => authenticatedRequest(session.token, '/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      type: 'dine_in',
      items: [{ menuId: tenantA.menu.id, quantity: 1 }],
    }),
  });
  const keys = [randomUUID(), randomUUID(), randomUUID()];
  const createdResponses = [];

  for (const key of keys) createdResponses.push(await submit(key));
  const createdOrders = await Promise.all(createdResponses.map(response => response.json()));
  assert.deepEqual(createdResponses.map(response => response.status), [201, 201, 201]);
  assert.ok(createdOrders.every(order => order.table_session_id === undefined));
  const persistedOrders = await database.prisma.order.findMany({
    where: { id: { in: createdOrders.map(order => order.id) } },
    select: { table_session_id: true },
  });
  assert.ok(persistedOrders.every(order => /^[0-9a-f-]{36}$/i.test(order.table_session_id)));
  assert.equal(new Set(persistedOrders.map(order => order.table_session_id)).size, 1);

  const replay = await submit(keys[0]);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).id, createdOrders[0].id);

  const blockedKey = randomUUID();
  const blocked = await submit(blockedKey);
  const blockedBody = await blocked.json();
  assert.equal(blocked.status, 409);
  assert.equal(blockedBody.code, 'ORDER_LIMIT_REACHED');
  assert.equal(blockedBody.requestId, blocked.headers.get('x-request-id'));
  assert.equal(await database.prisma.publicOrderIdempotency.count({ where: { key: blockedKey } }), 0);

  await database.prisma.order.update({
    where: { id: createdOrders[0].id },
    data: { status: 'served' },
  });
  const afterService = await submit(blockedKey);
  assert.equal(afterService.status, 201);
  assert.equal(
    await database.prisma.order.count({
      where: {
        table_session_id: persistedOrders[0].table_session_id,
        status: { in: ['pending', 'preparing', 'ready'] },
      },
    }),
    3,
  );
});

test('concurrent unique orders cannot cross the session cap and a new session has an independent allowance', async () => {
  const first = await createTableSession(tenantA);
  const submit = (session, key) => authenticatedRequest(session.token, '/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      type: 'dine_in',
      items: [{ menuId: tenantA.menu.id, quantity: 1 }],
    }),
  });

  const firstOrder = await submit(first.session, randomUUID());
  const secondOrder = await submit(first.session, randomUUID());
  assert.equal(firstOrder.status, 201);
  assert.equal(secondOrder.status, 201);

  const concurrentKeys = [randomUUID(), randomUUID()];
  const concurrent = await Promise.all(concurrentKeys.map(key => submit(first.session, key)));
  const concurrentBodies = await Promise.all(concurrent.map(response => response.json()));
  assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 409]);
  assert.equal(concurrentBodies.find(body => body.code)?.code, 'ORDER_LIMIT_REACHED');

  const persisted = await database.prisma.order.findMany({
    where: { id: { in: [(await firstOrder.json()).id, (await secondOrder.json()).id, ...concurrentBodies.map(body => body.id).filter(Boolean)] } },
    select: { table_session_id: true },
  });
  assert.equal(persisted.length, 3);
  assert.equal(new Set(persisted.map(order => order.table_session_id)).size, 1);
  const rejectedKey = concurrentKeys[concurrent.findIndex(response => response.status === 409)];
  assert.equal(await database.prisma.publicOrderIdempotency.count({ where: { key: rejectedKey } }), 0);

  const exchange = await postJson('/api/public/table-session', { capability: first.capability });
  const secondSession = await exchange.json();
  assert.equal(exchange.status, 200);
  const independent = await submit(secondSession, randomUUID());
  const independentBody = await independent.json();
  assert.equal(independent.status, 201);
  assert.equal(independentBody.table_session_id, undefined);
  const independentOrder = await database.prisma.order.findUnique({
    where: { id: independentBody.id },
    select: { table_session_id: true },
  });
  assert.notEqual(independentOrder.table_session_id, persisted[0].table_session_id);
});

test('ordering-state management is role- and tenant-scoped, audited, and assigns new tables to the active branch', async () => {
  const { adminToken } = await createTableSession(tenantA);
  const updateState = (branchId, state) => authenticatedRequest(
    adminToken,
    `/api/branches/${branchId}/ordering-state`,
    { method: 'PUT', body: JSON.stringify({ state }) },
  );

  const crossTenant = await updateState(tenantB.branchId, 'PAUSED');
  assert.equal(crossTenant.status, 404);
  assert.equal((await database.prisma.branch.findUnique({ where: { id: tenantB.branchId } })).ordering_state, 'OPEN');

  await database.prisma.organizationUser.update({
    where: {
      organization_id_user_id: {
        organization_id: tenantA.organization.id,
        user_id: tenantA.user.id,
      },
    },
    data: { role: 'STAFF' },
  });
  const staffDenied = await updateState(tenantA.branchId, 'PAUSED');
  assert.equal(staffDenied.status, 403);

  await database.prisma.organizationUser.update({
    where: {
      organization_id_user_id: {
        organization_id: tenantA.organization.id,
        user_id: tenantA.user.id,
      },
    },
    data: { role: 'MANAGER' },
  });
  const changed = await updateState(tenantA.branchId, 'paused');
  const changedBody = await changed.json();
  assert.equal(changed.status, 200);
  assert.equal(changedBody.state, 'PAUSED');

  const loaded = await authenticatedRequest(
    adminToken,
    `/api/branches/${tenantA.branchId}/ordering-state`,
  );
  assert.equal(loaded.status, 200);
  assert.equal((await loaded.json()).state, 'PAUSED');

  const audit = await database.prisma.auditEvent.findFirst({
    where: {
      organization_id: tenantA.organization.id,
      branch_id: tenantA.branchId,
      action: 'ORDERING_STATE_CHANGED',
    },
  });
  assert.equal(audit.actor_admin_id, tenantA.admin.id);
  assert.deepEqual(audit.metadata, {
    previousState: 'OPEN',
    newState: 'PAUSED',
    requestId: changed.headers.get('x-request-id'),
  });

  const repeated = await updateState(tenantA.branchId, 'PAUSED');
  assert.equal(repeated.status, 200);
  assert.equal(await database.prisma.auditEvent.count({ where: { action: 'ORDERING_STATE_CHANGED' } }), 1);

  const createdTable = await authenticatedRequest(adminToken, '/api/tables', {
    method: 'POST',
    body: JSON.stringify({ code: 'A-02', capacity: 4 }),
  });
  const tableBody = await createdTable.json();
  assert.equal(createdTable.status, 200);
  assert.equal(tableBody.branch_id, tenantA.branchId);
});

test('public orders enforce branch and table states without breaking exact replay or mutating rejections', async () => {
  const { adminToken, session } = await createTableSession(tenantA);
  const firstKey = randomUUID();
  const requestBody = JSON.stringify({
    type: 'dine_in',
    promotionCode: tenantA.promotion.code,
    items: [{ menuId: tenantA.menu.id, quantity: 1 }],
  });
  const submit = key => authenticatedRequest(session.token, '/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: requestBody,
  });
  const setState = state => authenticatedRequest(
    adminToken,
    `/api/branches/${tenantA.branchId}/ordering-state`,
    { method: 'PUT', body: JSON.stringify({ state }) },
  );
  const telemetryEvents = [];
  const originalRecord = rejectionTelemetry.record;
  rejectionTelemetry.record = event => {
    telemetryEvents.push(event);
    return originalRecord(event);
  };

  const first = await submit(firstKey);
  const firstBody = await first.json();
  assert.equal(first.status, 201);
  assert.equal(await setState('PAUSED').then(response => response.status), 200);

  const replay = await submit(firstKey);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).id, firstBody.id);

  const expectations = [
    ['PAUSED', 'RESTAURANT_PAUSED'],
    ['CLOSED', 'RESTAURANT_CLOSED'],
    ['OVERLOADED', 'RESTAURANT_OVERLOADED'],
  ];
  for (const [state, code] of expectations) {
    assert.equal(await setState(state).then(response => response.status), 200);
    const rejected = await submit(randomUUID());
    const body = await rejected.json();
    assert.equal(rejected.status, 409);
    assert.equal(body.code, code);
    assert.equal(body.requestId, rejected.headers.get('x-request-id'));
  }

  assert.equal(await setState('OPEN').then(response => response.status), 200);
  await database.prisma.table.update({ where: { id: tenantA.table.id }, data: { status: 'reserved' } });
  const tableRejectedKey = randomUUID();
  const tableRejected = await submit(tableRejectedKey);
  assert.equal(tableRejected.status, 409);
  assert.equal((await tableRejected.json()).code, 'TABLE_UNAVAILABLE');
  rejectionTelemetry.record = originalRecord;

  assert.equal(await database.prisma.order.count({ where: { table_session_id: { not: null } } }), 1);
  assert.equal(await database.prisma.publicOrderIdempotency.count(), 1);
  assert.equal((await database.prisma.promotion.findUnique({ where: { id: tenantA.promotion.id } })).times_used, 1);
  assert.equal(await database.prisma.publicOrderIdempotency.count({ where: { key: tableRejectedKey } }), 0);
  assert.deepEqual(
    telemetryEvents.map(event => event.reasonCode),
    ['RESTAURANT_PAUSED', 'RESTAURANT_CLOSED', 'RESTAURANT_OVERLOADED', 'TABLE_UNAVAILABLE'],
  );
  assert.ok(telemetryEvents.every(event =>
    Object.keys(event).every(key => [
      'requestId',
      'organizationId',
      'branchId',
      'tableId',
      'reasonCode',
      'counters',
    ].includes(key))
  ));
});

test('dine-in order creation requires a valid current table session before mutation', async () => {
  const beforeCount = await database.prisma.order.count();
  const missing = await postJson('/api/orders', {
    type: 'dine_in',
    adminId: tenantA.admin.id,
    tableCode: tenantA.table.code,
    items: [{ menuId: tenantA.menu.id, quantity: 1 }],
  });
  const missingBody = await missing.json();

  assert.equal(missing.status, 401);
  assert.equal(missingBody.code, 'TABLE_SESSION_REQUIRED');
  assert.equal(await database.prisma.order.count(), beforeCount);

  const login = await postJson('/api/auth/login', {
    email: tenantA.user.email,
    password: tenantA.password,
  });
  const { token: adminToken } = await login.json();
  const firstRotation = await authenticatedRequest(
    adminToken,
    `/api/tables/${tenantA.table.id}/capability/rotate`,
    { method: 'POST' },
  );
  const firstCapability = await firstRotation.json();
  const exchange = await postJson('/api/public/table-session', {
    capability: firstCapability.capability,
  });
  const oldSession = await exchange.json();

  await authenticatedRequest(
    adminToken,
    `/api/tables/${tenantA.table.id}/capability/rotate`,
    { method: 'POST' },
  );
  const rotatedOrder = await authenticatedRequest(oldSession.token, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      type: 'dine_in',
      items: [{ menuId: tenantA.menu.id, quantity: 1 }],
    }),
  });
  const rotatedBody = await rotatedOrder.json();

  assert.equal(rotatedOrder.status, 403);
  assert.equal(rotatedBody.code, 'TABLE_SESSION_INVALID');
  assert.equal(await database.prisma.order.count(), beforeCount);
});

test('capability management is tenant-scoped and revocation fails closed', async () => {
  const login = await postJson('/api/auth/login', {
    email: tenantA.user.email,
    password: tenantA.password,
  });
  const { token: adminToken } = await login.json();
  const crossTenant = await authenticatedRequest(
    adminToken,
    `/api/tables/${tenantB.table.id}/capability/rotate`,
    { method: 'POST' },
  );
  assert.equal(crossTenant.status, 404);

  await assert.rejects(
    database.prisma.tableCapability.create({
      data: {
        table_id: tenantA.table.id,
        organization_id: tenantB.organization.id,
        secret_hash: 'a'.repeat(64),
      },
    }),
    /Foreign key constraint violated/,
  );

  const rotation = await authenticatedRequest(
    adminToken,
    `/api/tables/${tenantA.table.id}/capability/rotate`,
    { method: 'POST' },
  );
  const { capability } = await rotation.json();
  const revoke = await authenticatedRequest(
    adminToken,
    `/api/tables/${tenantA.table.id}/capability`,
    { method: 'DELETE' },
  );
  assert.equal(revoke.status, 200);

  const exchange = await postJson('/api/public/table-session', { capability });
  const body = await exchange.json();
  assert.equal(exchange.status, 403);
  assert.equal(body.code, 'TABLE_SESSION_INVALID');
});

test('table session exchange enforces the accepted per-capability limit', async () => {
  const login = await postJson('/api/auth/login', {
    email: tenantA.user.email,
    password: tenantA.password,
  });
  const { token: adminToken } = await login.json();
  const rotation = await authenticatedRequest(
    adminToken,
    `/api/tables/${tenantA.table.id}/capability/rotate`,
    { method: 'POST' },
  );
  const { capability } = await rotation.json();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await postJson('/api/public/table-session', { capability });
    assert.equal(response.status, 200);
  }
  const limited = await postJson('/api/public/table-session', { capability });
  const limitedBody = await limited.json();
  assert.equal(limited.status, 429);
  assert.equal(limitedBody.code, 'RATE_LIMITED');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('read-only tenant verification command approves the clean deployment fixture', async () => {
  const report = await runTenantOwnershipVerification({
    databaseUrl: database.databaseUrl,
    output: () => undefined,
  });

  assert.equal(report.length, 7);
  assert.ok(report.every(root => root.enforcement_ready));
});
