/**
 * UAT fixture seeder for the QA + UAT master test plan.
 * Builds tenant Alpha (subject) and tenant Beta (isolation target)
 * exactly as described in the plan's test data sheet.
 *
 * Destructive: wipes the target database before seeding.
 * Refuses to run against anything but a local qr_uat database.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';

const url = process.env.DATABASE_URL || '';
if (!/localhost|127\.0\.0\.1/.test(url) || !/qr_uat/.test(url)) {
  console.error('Refusing to seed: DATABASE_URL must be a local qr_uat database.');
  console.error('Got:', url.replace(/:[^:@/]*@/, ':***@'));
  process.exit(1);
}

const prisma = new PrismaClient();
const PASSWORD = 'UatPass!234';
const capabilityFor = () => randomBytes(32).toString('base64url');
const hashCapability = cap => createHash('sha256').update(cap).digest('hex');

const day = n => new Date(Date.now() + n * 86400000);

// The database enforces immutable entitlements per plan
// (admins_plan_entitlements_finite_check). Never invent limits here.
const PLAN_ENTITLEMENTS = {
  STANDARD: { max_tables: 10, max_menu_items: 50, max_staff_accounts: 1 },
  BASIC: { max_tables: 25, max_menu_items: 150, max_staff_accounts: 3 },
  PRO: { max_tables: 500, max_menu_items: 2000, max_staff_accounts: 10 },
};

async function wipe() {
  // Child-to-parent order so foreign keys never block the truncate.
  const tables = [
    'public_order_idempotency', 'api_idempotency_keys', 'order_tracking_tokens',
    'order_items', 'orders', 'promotions', 'table_capabilities', 'tables',
    'menu_modifier_groups', 'modifier_options', 'modifier_groups',
    'combo_group_items', 'combo_groups', 'menu_ingredients', 'menus',
    'ingredients', 'categories', 'uploads', 'audit_events',
    'platform_audit_events', 'restaurant_invitations',
    'organization_users', 'users', 'admins', 'branches', 'organizations',
    'super_admins',
  ];
  for (const t of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`).catch(() => {});
  }
}

async function seedTenant(spec) {
  const org = await prisma.organization.create({
    data: { name: spec.name, slug: spec.slug, active: true },
  });
  const branch = await prisma.branch.create({
    data: {
      organization_id: org.id, code: spec.branchCode, name: spec.name + ' Main',
      timezone: 'Asia/Amman', currency: spec.currency, active: true,
    },
  });
  const admin = await prisma.admin.create({
    data: {
      organization_id: org.id, default_branch_id: branch.id,
      email: spec.ownerEmail, restaurant_name: spec.name,
      phone: spec.phone, address: spec.address,
      subscription_plan: spec.plan, subscription_status: spec.subStatus,
      subscription_end: spec.subEnd, ...PLAN_ENTITLEMENTS[spec.plan],
      pricing_prefs: spec.pricing, billing_settings: spec.billing,
      preferred_language: 'en',
    },
  });

  const password_hash = await bcrypt.hash(PASSWORD, 10);
  const members = [];
  for (const m of spec.members) {
    const user = await prisma.user.create({
      data: { email: m.email, password_hash, name: m.name, active: true },
    });
    await prisma.organizationUser.create({
      data: {
        organization_id: org.id, user_id: user.id, default_branch_id: branch.id,
        role: m.role, status: 'ACTIVE',
      },
    });
    members.push({ email: m.email, role: m.role });
  }

  const base = { admin_id: admin.id, organization_id: org.id, branch_id: branch.id };
  const categories = {};
  for (const cat of spec.categories) {
    const row = await prisma.category.create({
      data: { ...base, name_en: cat.en, name_ar: cat.ar, sort_order: cat.sort },
    });
    categories[cat.en] = row.id;
  }

  const menus = [];
  for (const item of spec.menu) {
    const row = await prisma.menu.create({
      data: {
        user_id: admin.id, organization_id: org.id, branch_id: branch.id,
        category_id: categories[item.cat],
        name_en: item.en, name_ar: item.ar,
        description_en: item.desc, price: item.price,
        available: item.available !== false,
        has_modifiers: Boolean(item.modifiers),
        is_featured: Boolean(item.featured),
        tags: item.tags || [],
      },
    });
    menus.push({ id: row.id, ...item });
  }

  // Required and optional modifier groups, attached to flagged items.
  for (const group of spec.modifierGroups || []) {
    const mg = await prisma.modifierGroup.create({
      data: {
        organization_id: org.id, name_en: group.en, name_ar: group.ar,
        selection_type: group.type, min_select: group.min,
        max_select: group.max, required: group.required,
      },
    });
    for (const opt of group.options) {
      await prisma.modifierOption.create({
        data: {
          group_id: mg.id, name_en: opt.en, name_ar: opt.ar,
          price_delta: opt.delta, is_default: Boolean(opt.default),
        },
      });
    }
    for (const name of group.attachTo) {
      const menu = menus.find(m => m.en === name);
      if (menu) await prisma.menuModifierGroup.create({ data: { menu_id: menu.id, group_id: mg.id } });
    }
  }

  const tables = [];
  for (const t of spec.tables) {
    const row = await prisma.table.create({
      data: { ...base, code: t.code, capacity: t.capacity, status: t.status || 'available' },
    });
    let capability = null;
    if (t.capability !== false) {
      capability = capabilityFor();
      await prisma.tableCapability.create({
        data: {
          table_id: row.id, organization_id: org.id,
          secret_hash: hashCapability(capability),
          version: t.version || 1, active: t.active !== false,
        },
      });
    }
    tables.push({ id: row.id, code: t.code, capability, active: t.active !== false, note: t.note });
  }

  for (const p of spec.promotions || []) {
    await prisma.promotion.create({
      data: {
        ...base, code: p.code, type: p.type, value: p.value,
        min_order: p.minOrder ?? null, start_at: p.startAt ?? null, end_at: p.endAt ?? null,
        usage_limit: p.usageLimit ?? null, times_used: p.timesUsed || 0,
        active: p.active !== false, applies_to: 'global',
      },
    });
  }

  for (const o of spec.orders || []) {
    const table = tables.find(t => t.code === o.table);
    const items = o.items.map(i => {
      const menu = menus.find(m => m.en === i.name);
      return { menu, qty: i.qty };
    });
    const subtotal = items.reduce((sum, i) => sum + Number(i.menu.price) * i.qty, 0);
    const order = await prisma.order.create({
      data: {
        ...base, table_id: table.id,
        subtotal, total: subtotal, status: o.status,
        type: 'dine_in', source: 'QR', payment_method: 'CASH',
      },
    });
    for (const i of items) {
      await prisma.orderItem.create({
        data: {
          order_id: order.id, menu_id: i.menu.id, quantity: i.qty,
          price_at_order: i.menu.price,
        },
      });
    }
  }

  return { org, branch, admin, members, tables, menuCount: menus.length };
}

const ALPHA = {
  name: 'Alpha Grill', slug: 'alpha-grill', branchCode: 'ALPHA-MAIN', currency: 'JOD',
  ownerEmail: 'owner.alpha@test.local', phone: '+962 7 9412 8837', address: 'Rainbow Street, Amman',
  plan: 'BASIC', subStatus: 'ACTIVE', subEnd: day(180),
  pricing: {
    baseCurrency: 'JOD', enabledCurrencies: ['JOD', 'USD'],
    exchangeRates: { JOD: 1, USD: 1.41, QAR: 0, SAR: 0 },
    priceDisplay: 'symbol', rounding: 'nearest-0.05', taxInclusive: false,
  },
  billing: { vatPercent: 16, serviceChargePercent: 10, deliveryFee: 0, showVatLine: true, showServiceChargeLine: true },
  members: [
    { email: 'owner.alpha@test.local', name: 'Rana Al-Khatib', role: 'OWNER' },
    { email: 'manager.alpha@test.local', name: 'Tareq Nabulsi', role: 'MANAGER' },
    { email: 'staff.alpha@test.local', name: 'Dima Haddad', role: 'STAFF' },
  ],
  categories: [
    { en: 'Mezze', ar: 'مقبلات', sort: 1 },
    { en: 'From the Grill', ar: 'من الشواية', sort: 2 },
    { en: 'Sides', ar: 'أطباق جانبية', sort: 3 },
    { en: 'Drinks', ar: 'مشروبات', sort: 4 },
  ],
  menu: [
    { cat: 'Mezze', en: 'Hummus Beiruti', ar: 'حمص بيروتي', price: 3.25, desc: 'Chickpeas, tahini, lemon, parsley.', featured: true, tags: ['popular'] },
    { cat: 'Mezze', en: 'Mutabbal', ar: 'متبل', price: 3.5, desc: 'Smoked aubergine with tahini.' },
    { cat: 'Mezze', en: 'Tabbouleh', ar: 'تبولة', price: 3.0, desc: 'Parsley, bulgur, tomato, lemon.', tags: ['vegan'] },
    { cat: 'Mezze', en: 'Fattoush', ar: 'فتوش', price: 3.4, desc: 'Garden salad with sumac and crisp bread.' },
    { cat: 'Mezze', en: 'Warak Enab', ar: 'ورق عنب', price: 4.1, desc: 'Vine leaves rolled with rice and herbs.' },
    { cat: 'Mezze', en: 'Kibbeh Plate', ar: 'كبة', price: 4.75, desc: 'Four pieces, served hot.', available: false },
    { cat: 'From the Grill', en: 'Mixed Grill', ar: 'مشاوي مشكلة', price: 12.9, desc: 'Shish taouk, kofta, and lamb cutlets.', modifiers: true, featured: true, tags: ['best_seller'] },
    { cat: 'From the Grill', en: 'Shish Taouk', ar: 'شيش طاووق', price: 8.5, desc: 'Marinated chicken skewers.', modifiers: true },
    { cat: 'From the Grill', en: 'Lamb Kofta', ar: 'كفتة غنم', price: 9.25, desc: 'Hand-minced lamb with onion and parsley.', modifiers: true, tags: ['spicy'] },
    { cat: 'From the Grill', en: 'Grilled Sea Bass', ar: 'سمك مشوي', price: 14.5, desc: 'Whole fish, charcoal grilled.' },
    { cat: 'From the Grill', en: 'Farrouj Musahab', ar: 'فروج مسحب', price: 7.9, desc: 'Half chicken, garlic and lemon.' },
    { cat: 'Sides', en: 'Garlic Paste', ar: 'ثومية', price: 1.2, desc: 'House toum.' },
    { cat: 'Sides', en: 'Grilled Vegetables', ar: 'خضار مشوية', price: 3.6, desc: 'Tomato, onion, and pepper.' },
    { cat: 'Sides', en: 'Saj Bread Basket', ar: 'سلة خبز صاج', price: 1.0, desc: 'Four pieces, baked to order.' },
    { cat: 'Sides', en: 'French Fries', ar: 'بطاطا مقلية', price: 2.4, desc: 'Cut in house.', available: false },
    { cat: 'Drinks', en: 'Fresh Lemon Mint', ar: 'ليمون بالنعناع', price: 2.75, desc: 'Blended to order.', tags: ['popular'] },
    { cat: 'Drinks', en: 'Arabic Coffee', ar: 'قهوة عربية', price: 1.6, desc: 'Cardamom, served in a finjan.' },
    { cat: 'Drinks', en: 'Sparkling Water', ar: 'مياه غازية', price: 1.4, desc: '330ml bottle.' },
  ],
  modifierGroups: [
    {
      en: 'Doneness', ar: 'درجة النضج', type: 'single', min: 1, max: 1, required: true,
      attachTo: ['Mixed Grill', 'Lamb Kofta'],
      options: [
        { en: 'Medium', ar: 'وسط', delta: 0, default: true },
        { en: 'Well done', ar: 'ناضج جيداً', delta: 0 },
      ],
    },
    {
      en: 'Choose your side', ar: 'اختر الطبق الجانبي', type: 'single', min: 1, max: 1, required: true,
      attachTo: ['Shish Taouk'],
      options: [
        { en: 'Rice', ar: 'أرز', delta: 0, default: true },
        { en: 'Fries', ar: 'بطاطا', delta: 0.75 },
        { en: 'Grilled vegetables', ar: 'خضار مشوية', delta: 1.2 },
      ],
    },
    {
      en: 'Extras', ar: 'إضافات', type: 'multiple', min: 0, max: 3, required: false,
      attachTo: ['Mixed Grill', 'Shish Taouk', 'Lamb Kofta'],
      options: [
        { en: 'Extra garlic paste', ar: 'ثومية إضافية', delta: 0.6 },
        { en: 'Extra bread', ar: 'خبز إضافي', delta: 0.5 },
        { en: 'Chilli sauce', ar: 'صلصة حارة', delta: 0.4 },
      ],
    },
  ],
  tables: [
    { code: 'T-01', capacity: 4, status: 'occupied', note: 'carries three open orders for the capacity ceiling case' },
    { code: 'T-02', capacity: 2 },
    { code: 'T-03', capacity: 6 },
    { code: 'T-04', capacity: 4, version: 2, note: 'capability already rotated once' },
    { code: 'T-05', capacity: 8, active: false, note: 'capability revoked, must fail closed' },
    { code: 'T-06', capacity: 4, note: 'clean-state control, do not touch' },
  ],
  promotions: [
    { code: 'WELCOME10', type: 'percent', value: 10, endAt: day(30) },
    { code: 'FLAT2', type: 'fixed', value: 2, endAt: day(30) },
    { code: 'EXPIRED5', type: 'percent', value: 5, startAt: day(-60), endAt: day(-2) },
    { code: 'SPEND20', type: 'percent', value: 15, minOrder: 20, endAt: day(30) },
    { code: 'ONESHOT', type: 'fixed', value: 3, usageLimit: 1, timesUsed: 0, endAt: day(30) },
    { code: 'INACTIVE', type: 'percent', value: 25, active: false, endAt: day(30) },
  ],
  orders: [
    { table: 'T-01', status: 'pending', items: [{ name: 'Mixed Grill', qty: 1 }, { name: 'Hummus Beiruti', qty: 2 }] },
    { table: 'T-01', status: 'preparing', items: [{ name: 'Shish Taouk', qty: 2 }] },
    { table: 'T-01', status: 'ready', items: [{ name: 'Fresh Lemon Mint', qty: 3 }] },
    { table: 'T-02', status: 'served', items: [{ name: 'Lamb Kofta', qty: 1 }, { name: 'Saj Bread Basket', qty: 1 }] },
    { table: 'T-03', status: 'cancelled', items: [{ name: 'Grilled Sea Bass', qty: 1 }] },
  ],
};

const BETA = {
  name: 'Beta Kitchen', slug: 'beta-kitchen', branchCode: 'BETA-MAIN', currency: 'JOD',
  ownerEmail: 'owner.beta@test.local', phone: '+962 7 7365 2094', address: 'Sweifieh, Amman',
  plan: 'STANDARD', subStatus: 'CANCELLED', subEnd: day(-5),
  pricing: {
    baseCurrency: 'JOD', enabledCurrencies: ['JOD'],
    exchangeRates: { JOD: 1, USD: 0, QAR: 0, SAR: 0 },
    priceDisplay: 'symbol', rounding: 'none', taxInclusive: true,
  },
  billing: { vatPercent: 0, serviceChargePercent: 0, deliveryFee: 0, showVatLine: false, showServiceChargeLine: false },
  members: [{ email: 'owner.beta@test.local', name: 'Yousef Mansour', role: 'OWNER' }],
  categories: [
    { en: 'Bowls', ar: 'أطباق', sort: 1 },
    { en: 'Cold Drinks', ar: 'مشروبات باردة', sort: 2 },
  ],
  menu: [
    { cat: 'Bowls', en: 'Beta Chicken Bowl', ar: 'طبق دجاج', price: 6.5, desc: 'Isolation-target item. Must never appear under Alpha.' },
    { cat: 'Bowls', en: 'Beta Falafel Bowl', ar: 'طبق فلافل', price: 5.25, desc: 'Isolation-target item.' },
    { cat: 'Bowls', en: 'Beta Beef Bowl', ar: 'طبق لحم', price: 7.75, desc: 'Isolation-target item.' },
    { cat: 'Cold Drinks', en: 'Beta Iced Tea', ar: 'شاي مثلج', price: 2.0, desc: 'Isolation-target item.' },
    { cat: 'Cold Drinks', en: 'Beta Lemonade', ar: 'ليمونادة', price: 2.25, desc: 'Isolation-target item.' },
  ],
  tables: [
    { code: 'B-01', capacity: 4 },
    { code: 'B-02', capacity: 2 },
  ],
  promotions: [{ code: 'BETA10', type: 'percent', value: 10, endAt: day(30) }],
  orders: [{ table: 'B-01', status: 'pending', items: [{ name: 'Beta Chicken Bowl', qty: 1 }] }],
};

async function main() {
  console.log('Wiping target database…');
  await wipe();

  console.log('Seeding tenant Alpha…');
  const alpha = await seedTenant(ALPHA);
  console.log('Seeding tenant Beta…');
  const beta = await seedTenant(BETA);

  const superAdmin = await prisma.superAdmin.create({
    data: {
      email: 'platform.admin@test.local',
      password: await bcrypt.hash(PASSWORD, 10),
      name: 'Platform Operator',
      role: 'SUPER_ADMIN',
      active: true,
    },
  });

  const report = {
    generatedAt: new Date().toISOString(),
    password: PASSWORD,
    superAdmin: superAdmin.email,
    alpha: {
      organizationId: alpha.org.id, adminId: alpha.admin.id, branchId: alpha.branch.id,
      members: alpha.members, menuCount: alpha.menuCount,
      tables: alpha.tables.map(t => ({
        code: t.code, id: t.id, active: t.active, note: t.note,
        qrUrl: t.capability
          ? `http://localhost:5173/menu?table=${encodeURIComponent(t.code)}&restaurant=${alpha.admin.id}&cap=${t.capability}`
          : null,
      })),
    },
    beta: {
      organizationId: beta.org.id, adminId: beta.admin.id, branchId: beta.branch.id,
      members: beta.members, menuCount: beta.menuCount,
      tables: beta.tables.map(t => ({
        code: t.code, id: t.id,
        qrUrl: t.capability
          ? `http://localhost:5173/menu?table=${encodeURIComponent(t.code)}&restaurant=${beta.admin.id}&cap=${t.capability}`
          : null,
      })),
    },
  };

  // The report carries live capability secrets and the shared test password,
  // so it is written to a gitignored path. Override with UAT_FIXTURES_OUT.
  const out = process.env.UAT_FIXTURES_OUT
    || new URL('../../.uat-fixtures.json', import.meta.url).pathname;
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log('\nFixtures written to', out);
  console.log('Alpha admin id:', alpha.admin.id);
  console.log('Beta  admin id:', beta.admin.id);
  console.log('Shared password:', PASSWORD);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
