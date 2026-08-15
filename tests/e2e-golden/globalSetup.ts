// Starts the REAL server/index.js against a disposable Postgres database
// (reusing tests/helpers/testDatabase.js) and seeds one real organization/
// admin/branch/table/menu-item through direct Prisma writes, matching the
// established fixture pattern in
// tests/integration/tenantAccess.integration.test.js. A real HTTP login +
// capability rotation call (against this same running server) produces the
// raw QR capability the golden E2E spec navigates with.
//
// Runs as Playwright's globalSetup (not a webServer entry) specifically so
// its returned teardown function executes in the same process: an
// http.Server managing a live Socket.IO connection can hang well past a
// cross-process SIGTERM/teardown window, but only the database drop
// actually needs to complete cleanly here, and an in-process function call
// guarantees that runs.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { createTestDatabase } from '../helpers/testDatabase.js';

const PORT = Number(process.env.GOLDEN_E2E_PORT || 3901);
const FIXTURE_PATH = process.env.GOLDEN_E2E_FIXTURE_PATH
  || path.resolve(process.cwd(), 'tests/e2e-golden/.fixture.json');

process.env.NODE_ENV = 'test'; // keeps server/index.js's own auto-listen disabled; we listen explicitly below
process.env.JWT_SECRET = process.env.JWT_SECRET || 'golden-e2e-development-secret';

export default async function globalSetup() {
  const database = await createTestDatabase();
  process.env.DATABASE_URL = database.databaseUrl;

  const application = await import(/* @vite-ignore */ `../../server/index.js?golden=${Date.now()}`);
  const { default: prisma } = await import('../../server/db.js');
  const { server } = application;

  const id = randomUUID();
  const branchId = randomUUID();
  const userId = randomUUID();
  const adminId = randomUUID();
  const password = 'Golden-e2e-password!1';
  const passwordHash = await bcrypt.hash(password, 4);
  const email = `golden-${id.slice(0, 8)}@example.com`;
  const tableCode = 'G1';

  const organization = await prisma.organization.create({
    data: { id, name: 'Golden E2E Restaurant', slug: `golden-e2e-${id.slice(0, 8)}` },
  });
  await prisma.branch.create({
    data: { id: branchId, organization_id: organization.id, code: 'MAIN', name: 'Main Branch' },
  });
  const admin = await prisma.admin.create({
    data: {
      id: adminId,
      organization_id: organization.id,
      default_branch_id: branchId,
      email,
      password: passwordHash,
      restaurant_name: 'Golden E2E Restaurant',
    },
  });
  const user = await prisma.user.create({
    data: { id: userId, email, password_hash: passwordHash, name: 'Golden E2E Owner' },
  });
  await prisma.organizationUser.create({
    data: {
      organization_id: organization.id,
      user_id: user.id,
      default_branch_id: branchId,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });
  const category = await prisma.category.create({
    data: {
      admin_id: admin.id,
      organization_id: organization.id,
      branch_id: branchId,
      name_en: 'Golden Category',
    },
  });
  await prisma.menu.create({
    data: {
      user_id: admin.id,
      organization_id: organization.id,
      branch_id: branchId,
      category_id: category.id,
      name_en: 'Golden Burger',
      price: 10,
      available: true,
      tags: [],
      suggested_items_ids: [],
    },
  });
  const table = await prisma.table.create({
    data: {
      admin_id: admin.id,
      organization_id: organization.id,
      branch_id: branchId,
      code: tableCode,
    },
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve());
  });
  const baseUrl = `http://127.0.0.1:${PORT}`;

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`Golden E2E seed login failed: ${login.status}`);
  const { token } = await login.json();

  const rotation = await fetch(`${baseUrl}/api/tables/${table.id}/capability/rotate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  if (!rotation.ok) throw new Error(`Golden E2E seed capability rotation failed: ${rotation.status}`);
  const { capability } = await rotation.json();

  await mkdir(path.dirname(FIXTURE_PATH), { recursive: true });
  await writeFile(
    FIXTURE_PATH,
    JSON.stringify({
      apiBaseUrl: `${baseUrl}/api`,
      organizationId: organization.id,
      adminId: admin.id,
      tableId: table.id,
      tableCode,
      capability,
      adminEmail: email,
      adminPassword: password,
    }, null, 2),
  );

  console.log(`[golden-e2e] backend ready on port ${PORT}, database ${database.databaseName}`);

  return async () => {
    console.log('[golden-e2e] tearing down');
    try {
      await prisma.$disconnect();
    } catch (error) {
      console.error('[golden-e2e] prisma disconnect failed:', error);
    }
    try {
      await database.close();
    } catch (error) {
      console.error('[golden-e2e] database drop failed:', error);
    }
  };
}
