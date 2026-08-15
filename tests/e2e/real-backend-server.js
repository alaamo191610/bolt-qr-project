import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/testDatabase.js';

const port = Number(process.env.REAL_E2E_PORT || 3100);
const fixturePath = process.env.REAL_E2E_FIXTURE
  || path.join(os.tmpdir(), 'bolt-qr-real-backend-fixture.json');

let database;
let applicationDatabase;
let applicationServer;
let uploadDirectory;
let shuttingDown = false;

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

const cleanup = async exitCode => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (applicationServer?.listening) {
      await new Promise((resolve, reject) => applicationServer.close(error => error ? reject(error) : resolve()));
    }
    if (applicationDatabase) await applicationDatabase.$disconnect();
    if (database) await database.close();
    if (uploadDirectory) await rm(uploadDirectory, { recursive: true, force: true });
    await rm(fixturePath, { force: true });
  } catch (error) {
    console.error('Real E2E cleanup failed:', error);
    exitCode = 1;
  } finally {
    process.exit(exitCode);
  }
};

try {
  process.env.NODE_ENV = 'test';
  process.env.PORT = String(port);
  uploadDirectory = await mkdtemp(path.join(os.tmpdir(), 'bolt-qr-real-e2e-uploads-'));
  process.env.UPLOAD_DIR = uploadDirectory;
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.databaseUrl;

  const application = await import(`../../server/index.js?real-e2e=${Date.now()}`);
  applicationServer = application.server;
  ({ default: applicationDatabase } = await import('../../server/db.js'));
  const fixture = await seedFixture(database.prisma);
  await writeFile(fixturePath, JSON.stringify(fixture), 'utf8');
  await new Promise((resolve, reject) => {
    applicationServer.listen(port, '127.0.0.1', error => error ? reject(error) : resolve());
  });
  console.log(`Real E2E backend listening on http://127.0.0.1:${port}`);
  process.once('SIGINT', () => void cleanup(0));
  process.once('SIGTERM', () => void cleanup(0));
} catch (error) {
  console.error('Real E2E backend failed to start:', error);
  await cleanup(1);
}
