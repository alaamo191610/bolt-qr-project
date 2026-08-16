import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/testDatabase.js';

// Runs as Playwright's globalSetup (not a webServer entry) so its returned
// teardown function executes in the same process: an http.Server managing a
// live Socket.IO connection can hang well past a cross-process webServer
// teardown window (confirmed - disposable bolt_qr_test_* databases were
// leaking on every run), but only the database drop actually needs to
// complete reliably here, and an in-process function call guarantees that.

const port = Number(process.env.REAL_E2E_PORT || 3100);
// tests/e2e/real-backend-golden.spec.ts reads this same fixed path directly
// (it has no access to this process's env). Not os.tmpdir()-derived: that
// resolves outside /tmp on macOS, which would silently desync the two.
const fixturePath = process.env.REAL_E2E_FIXTURE || '/tmp/bolt-qr-real-backend-fixture.json';

const seedFixture = async prisma => {
  const organizationId = randomUUID();
  const branchId = randomUUID();
  const userId = randomUUID();
  const adminId = randomUUID();
  const password = `Real-E2E-${randomUUID()}!`;
  const passwordHash = await bcrypt.hash(password, 4);

  const organization = await prisma.organization.create({
    data: {
      id: organizationId,
      name: 'Real E2E Restaurant',
      slug: `real-e2e-${organizationId.slice(0, 8)}`,
    },
  });
  const branch = await prisma.branch.create({
    data: {
      id: branchId,
      organization_id: organization.id,
      code: 'MAIN',
      name: 'Main Branch',
    },
  });
  const user = await prisma.user.create({
    data: {
      id: userId,
      email: `real-e2e-${organizationId.slice(0, 8)}@example.com`,
      password_hash: passwordHash,
      name: 'Real E2E Owner',
    },
  });
  const admin = await prisma.admin.create({
    data: {
      id: adminId,
      organization_id: organization.id,
      default_branch_id: branch.id,
      email: user.email,
      password: passwordHash,
      restaurant_name: organization.name,
      // Both browser projects share this organization and add a team member.
      // Use the exact PRO catalog entitlement so the fixture remains valid
      // under the database-level finite-plan constraint.
      subscription_plan: 'PRO',
      max_tables: 500,
      max_menu_items: 2_000,
      max_staff_accounts: 10,
    },
  });
  await prisma.organizationUser.create({
    data: {
      organization_id: organization.id,
      user_id: user.id,
      default_branch_id: branch.id,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });
  const category = await prisma.category.create({
    data: {
      admin_id: admin.id,
      organization_id: organization.id,
      branch_id: branch.id,
      name_en: 'Real E2E Category',
    },
  });
  const menu = await prisma.menu.create({
    data: {
      user_id: admin.id,
      organization_id: organization.id,
      branch_id: branch.id,
      category_id: category.id,
      name_en: 'Real E2E Burger',
      name_ar: 'برغر الاختبار الحقيقي',
      price: 10,
      tags: [],
      suggested_items_ids: [],
    },
  });
  const table = await prisma.table.create({
    data: {
      admin_id: admin.id,
      organization_id: organization.id,
      branch_id: branch.id,
      code: 'E2E-01',
    },
  });

  return {
    adminId: admin.id,
    email: user.email,
    password,
    organizationId: organization.id,
    tableId: table.id,
    tableCode: table.code,
    menuId: menu.id,
  };
};

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise(resolve => setTimeout(resolve, ms)),
]);

export default async function globalSetup() {
  process.env.NODE_ENV = 'test'; // keeps server/index.js's own auto-listen disabled; we listen explicitly below
  process.env.PORT = String(port);
  const uploadDirectory = await mkdtemp(path.join(os.tmpdir(), 'bolt-qr-real-e2e-uploads-'));
  process.env.UPLOAD_DIR = uploadDirectory;

  const database = await createTestDatabase();
  process.env.DATABASE_URL = database.databaseUrl;

  const application = await import(`../../server/index.js?real-e2e=${Date.now()}`);
  const { default: applicationDatabase } = await import('../../server/db.js');
  const applicationServer = application.server;

  const fixture = await seedFixture(database.prisma);
  await writeFile(fixturePath, JSON.stringify(fixture), 'utf8');

  await new Promise((resolve, reject) => {
    applicationServer.once('error', reject);
    applicationServer.listen(port, '127.0.0.1', () => resolve());
  });
  console.log(`[real-e2e] backend ready on port ${port}, database ${database.databaseName}`);

  return async () => {
    console.log('[real-e2e] tearing down');
    try {
      await withTimeout(applicationDatabase.$disconnect(), 3000);
    } catch (error) {
      console.error('[real-e2e] prisma disconnect failed:', error);
    }
    try {
      await withTimeout(database.close(), 5000);
    } catch (error) {
      console.error('[real-e2e] database drop failed:', error);
    }
    try {
      await rm(uploadDirectory, { recursive: true, force: true });
      await rm(fixturePath, { force: true });
    } catch (error) {
      console.error('[real-e2e] fixture cleanup failed:', error);
    }
  };
}
