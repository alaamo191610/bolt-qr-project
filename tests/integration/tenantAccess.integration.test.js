import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createTestDatabase } from '../helpers/testDatabase.js';

let database;
let applicationDatabase;
let app;
let httpServer;
let baseUrl;
let tenantA;
let tenantB;

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
      branch_id: branchId,
      name_en: `${label} Category`,
    },
  });
  const menu = await database.prisma.menu.create({
    data: {
      user_id: admin.id,
      branch_id: branchId,
      category_id: category.id,
      name_en: `${label} Menu Item`,
      price: 10,
      tags: [],
      suggested_items_ids: [],
    },
  });

  return { organization, branchId, admin, user, category, menu, password };
};

before(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.databaseUrl;
  ({ app } = await import(`../../server/index.js?integration=${Date.now()}`));
  ({ default: applicationDatabase } = await import('../../server/db.js'));
  httpServer = createServer(app);
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

beforeEach(async () => {
  await database.reset();
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
});
