import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import prisma from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { unlink } from 'fs/promises';

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? null : 'development-only-change-me');

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || !isProduction || configuredOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
};

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: corsOptions
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-admin', async (payload) => {
    const adminId = typeof payload === 'string' ? payload : payload?.adminId;
    const token = typeof payload === 'object' ? payload?.token : null;

    if (!adminId || !token) return;

    try {
      const user = jwt.verify(token, JWT_SECRET);
      if (user.role !== 'RESTAURANT_ADMIN' || user.id !== adminId) return;

      const admin = await prisma.admin.findUnique({
        where: { id: user.id },
        select: { id: true }
      });
      if (!admin) return;

      socket.join(`admin_${adminId}`);
      console.log(`Socket ${socket.id} joined admin_${adminId}`);
    } catch {
      // Invalid socket credentials are deliberately ignored.
    }
  });

  socket.on('join-menu', (adminId) => {
    socket.join(`menu_${adminId}`);
    console.log(`Socket ${socket.id} joined menu_${adminId}`);
  });

  socket.on('join-order', (orderId) => {
    socket.join(`order_${orderId}`);
    console.log(`Socket ${socket.id} joined order_${orderId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
    callback(null, true);
  }
});

app.disable('x-powered-by');
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use('/uploads', express.static('uploads'));

const rateLimitBuckets = new Map();
const createRateLimiter = ({ windowMs, max }) => (req, res, next) => {
  const now = Date.now();
  const key = `${req.ip}:${req.path}`;
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (current.count >= max) {
    res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  current.count += 1;
  next();
};

const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const orderRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 30 });

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = authHeader.slice('Bearer '.length).trim();
    const user = jwt.verify(token, JWT_SECRET);
    if (!user?.id) return res.status(403).json({ error: 'Invalid token' });

    if (user.role === 'SUPER_ADMIN') {
      const superAdmin = await prisma.superAdmin.findUnique({
        where: { id: user.id },
        select: { id: true }
      });
      if (!superAdmin) return res.status(403).json({ error: 'Invalid token' });
    } else {
      const admin = await prisma.admin.findUnique({
        where: { id: user.id },
        select: { id: true }
      });
      if (!admin) return res.status(403).json({ error: 'Invalid token' });
      user.role = 'RESTAURANT_ADMIN';
    }

    req.user = user;
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super-admin access required' });
  }
  next();
};

const publicAdminSelect = {
  id: true,
  email: true,
  restaurant_name: true,
  logo_url: true,
  phone: true,
  address: true,
  description: true,
  order_rules: true,
  kds_prefs: true,
  pricing_prefs: true,
  billing_settings: true,
  theme: true,
  theme_mode: true,
  theme_color: true,
  font_family: true,
  preferred_language: true,
  subscription_plan: true,
  subscription_status: true,
  subscription_end: true,
  trial_ends_at: true,
  max_tables: true,
  max_menu_items: true,
  max_staff_accounts: true,
  created_at: true,
};

// --- Auth Routes ---
app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await prisma.admin.findUnique({ where: { email } });

    if (!admin) {
      return res.status(401).json({ error: 'User not found. Please Sign Up first.' });
    }
    if (!admin.password) {
      return res.status(401).json({ error: 'Account exists but has no password. Please use Sign Up to set one.' });
    }
    if (!(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ error: 'Incorrect password' });
    }
    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: 'RESTAURANT_ADMIN' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: admin.id, email: admin.email, name: admin.restaurant_name } });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// --- Menus ---
app.get('/api/menus', authenticate, async (req, res) => {
  try {
    const menus = await prisma.menu.findMany({
      where: { user_id: req.user.id, deleted_at: null },
      orderBy: { created_at: 'desc' },
      include: {
        category: true,
        menu_ingredients: {
          include: { ingredient: true }
        }
      }
    });

    // Map to match frontend structure (category -> categories, menu_ingredients -> ingredients_details)
    const mapped = menus.map(m => ({
      ...m,
      categories: m.category,
      ingredients_details: m.menu_ingredients
    }));

    res.json(mapped);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/menus', authenticate, async (req, res) => {
  const { name_en, name_ar, price, category_id, image_url, available, ingredients } = req.body;
  const user_id = req.user.id; // Get user ID from authenticated token
  try {
    // 🆕 Enforce Menu Item Limit
    const admin = await prisma.admin.findUnique({
      where: { id: user_id },
      select: { max_menu_items: true }
    });

    const currentCount = await prisma.menu.count({
      where: { user_id, deleted_at: null }
    });

    if (admin && currentCount >= admin.max_menu_items) {
      return res.status(403).json({
        error: `Menu item limit reached for your plan (limit: ${admin.max_menu_items}). Please upgrade to add more.`
      });
    }

    const menu = await prisma.menu.create({
      data: {
        name_en, name_ar, price, category_id: Number(category_id), image_url, available, user_id,
        menu_ingredients: {
          create: (ingredients || []).map(id => ({ ingredient_id: Number(id) }))
        }
      }
    });
    res.json(menu);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/menus/:id', authenticate, async (req, res) => {
  const { name_en, name_ar, price, category_id, image_url, available, ingredients } = req.body;
  const menuId = Number(req.params.id);
  try {
    const ownedMenu = await prisma.menu.findFirst({
      where: { id: menuId, user_id: req.user.id },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });

    const data = {};
    if (name_en !== undefined) data.name_en = name_en;
    if (name_ar !== undefined) data.name_ar = name_ar;
    if (price !== undefined) data.price = price;
    if (category_id !== undefined) data.category_id = category_id === null ? null : Number(category_id);
    if (image_url !== undefined) data.image_url = image_url;
    if (available !== undefined) data.available = available;

    const result = await prisma.$transaction(async (tx) => {
      const menu = await tx.menu.update({
        where: { id: menuId },
        data
      });

      if (ingredients) {
        // Replace ingredients
        await tx.menuIngredient.deleteMany({ where: { menu_id: menu.id } });
        if (ingredients.length > 0) {
          await tx.menuIngredient.createMany({
            data: ingredients.map(id => ({ menu_id: menu.id, ingredient_id: Number(id) }))
          });
        }
      }
      return menu;
    });

    // Emit real-time update
    io.to(`menu_${req.user.id}`).emit('menu-updated', result);

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/menus/:id', authenticate, async (req, res) => {
  const menuId = Number(req.params.id);
  try {
    const ownedMenu = await prisma.menu.findFirst({
      where: { id: menuId, user_id: req.user.id },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });

    if (req.query.hard === 'true') {
      await prisma.menu.delete({ where: { id: menuId } });
    } else {
      await prisma.menu.update({
        where: { id: menuId },
        data: { deleted_at: new Date() }
      });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/reset-menu', authenticate, async (req, res) => {
  try {
    await prisma.menu.deleteMany({
      where: { user_id: req.user.id }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Advanced Menu Options ---

app.get('/api/menus/:id/options', authenticate, async (req, res) => {
  const menuId = Number(req.params.id);
  try {
    const ownedMenu = await prisma.menu.findFirst({
      where: { id: menuId, user_id: req.user.id },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });

    const [allIngredients, allMenus, menuIngredients, menuModifierGroups, comboGroups] = await Promise.all([
      prisma.ingredient.findMany({ orderBy: { name_en: 'asc' } }),
      prisma.menu.findMany({
        where: { user_id: req.user.id, deleted_at: null },
        select: { id: true, name_en: true, price: true },
        orderBy: { name_en: 'asc' }
      }),
      prisma.menuIngredient.findMany({ where: { menu_id: menuId } }),
      prisma.menuModifierGroup.findMany({
        where: { menu_id: menuId },
        include: { modifier_group: { include: { modifier_options: true } } }
      }),
      prisma.comboGroup.findMany({
        where: { menu_id: menuId },
        include: { combo_group_items: true }
      })
    ]);
    res.json({ allIngredients, allMenus, menuIngredients, menuModifierGroups, comboGroups });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/menus/:id/ingredients', authenticate, async (req, res) => {
  const menuId = Number(req.params.id);
  const { ingredients } = req.body;
  try {
    const ownedMenu = await prisma.menu.findFirst({
      where: { id: menuId, user_id: req.user.id },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });

    await prisma.$transaction(async (tx) => {
      await tx.menuIngredient.deleteMany({ where: { menu_id: menuId } });
      if (ingredients?.length) {
        await tx.menuIngredient.createMany({
          data: ingredients.map(i => ({
            menu_id: menuId,
            ingredient_id: Number(i.ingredient_id),
            removable: i.removable,
            extra_available: i.extra_available,
            max_extra: i.max_extra,
            extra_price_override: i.extra_price_override
          }))
        });
      }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/menus/:id/modifiers', authenticate, async (req, res) => {
  const menuId = Number(req.params.id);
  const { groups } = req.body;
  try {
    const ownedMenu = await prisma.menu.findFirst({
      where: { id: menuId, user_id: req.user.id },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });
    if (!Array.isArray(groups)) return res.status(400).json({ error: 'Modifier groups must be an array' });

    await prisma.$transaction(async (tx) => {
      const currentLinks = await tx.menuModifierGroup.findMany({
        where: { menu_id: menuId },
        select: { group_id: true }
      });
      const editableGroupIds = new Set(currentLinks.map(link => link.group_id));
      const groupIds = [];
      for (const gr of groups) {
        let gid = gr.id ? Number(gr.id) : undefined;
        const data = {
          name_en: gr.name_en,
          name_ar: gr.name_ar,
          selection_type: gr.selection_type,
          min_select: gr.min_select,
          max_select: gr.max_select,
          required: gr.required
        };

        if (gid) {
          if (!editableGroupIds.has(gid)) {
            throw Object.assign(new Error('Modifier group not found'), { status: 404 });
          }
          await tx.modifierGroup.update({ where: { id: gid }, data });
        } else {
          const newG = await tx.modifierGroup.create({ data });
          gid = newG.id;
        }
        groupIds.push(gid);

        await tx.modifierOption.deleteMany({ where: { group_id: gid } });
        if (gr.options?.length) {
          await tx.modifierOption.createMany({
            data: gr.options.map(o => ({
              group_id: gid,
              name_en: o.name_en,
              name_ar: o.name_ar,
              price_delta: o.price_delta,
              max_qty: o.max_qty,
              is_default: o.is_default
            }))
          });
        }
      }

      await tx.menuModifierGroup.deleteMany({ where: { menu_id: menuId } });
      if (groupIds.length) {
        await tx.menuModifierGroup.createMany({
          data: groupIds.map(gid => ({ menu_id: menuId, group_id: gid }))
        });
      }
    });
    res.json({ success: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

app.post('/api/menus/:id/combos', authenticate, async (req, res) => {
  const menuId = Number(req.params.id);
  const { combo } = req.body;
  try {
    const ownedMenu = await prisma.menu.findFirst({
      where: { id: menuId, user_id: req.user.id },
      select: { id: true }
    });
    if (!ownedMenu) return res.status(404).json({ error: 'Menu item not found' });
    if (!combo || typeof combo !== 'object') return res.status(400).json({ error: 'Combo configuration required' });

    await prisma.$transaction(async (tx) => {
      let groupId = combo.id ? Number(combo.id) : undefined;
      const data = {
        menu_id: menuId,
        min_select: combo.min_select,
        max_select: combo.max_select
      };

      if (groupId) {
        const ownedGroup = await tx.comboGroup.findFirst({
          where: { id: groupId, menu_id: menuId },
          select: { id: true }
        });
        if (!ownedGroup) throw Object.assign(new Error('Combo group not found'), { status: 404 });
        await tx.comboGroup.update({ where: { id: groupId }, data });
      } else {
        const newG = await tx.comboGroup.create({ data });
        groupId = newG.id;
      }

      await tx.comboGroupItem.deleteMany({ where: { group_id: groupId } });
      if (combo.items?.length) {
        const childIds = combo.items
          .filter(i => i.child_menu_id)
          .map(i => Number(i.child_menu_id));
        const ownedChildren = await tx.menu.count({
          where: { id: { in: childIds }, user_id: req.user.id, deleted_at: null }
        });
        if (ownedChildren !== new Set(childIds).size) {
          throw Object.assign(new Error('Combo contains an invalid menu item'), { status: 400 });
        }
        await tx.comboGroupItem.createMany({
          data: combo.items.filter(i => i.child_menu_id).map(i => ({
            group_id: groupId,
            child_menu_id: Number(i.child_menu_id),
            upgrade_price_delta: i.upgrade_price_delta,
            is_default: i.is_default
          }))
        });
      }
    });
    res.json({ success: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// Public endpoint for menu customization configuration
app.get('/api/public/menus/:id/config', async (req, res) => {
  const menuId = Number(req.params.id);
  try {
    const [menu, ingredients, modifierGroups, comboGroups] = await Promise.all([
      prisma.menu.findUnique({
        where: { id: menuId, deleted_at: null },
        include: { category: true }
      }),
      prisma.menuIngredient.findMany({
        where: { menu_id: menuId },
        include: { ingredient: true }
      }),
      prisma.menuModifierGroup.findMany({
        where: { menu_id: menuId },
        include: {
          modifier_group: {
            include: {
              modifier_options: true
            }
          }
        }
      }),
      prisma.comboGroup.findMany({
        where: { menu_id: menuId },
        include: {
          combo_group_items: {
            include: {
              menus: {
                select: { id: true, name_en: true, price: true }
              }
            }
          }
        }
      })
    ]);

    if (!menu) return res.status(404).json({ error: 'Menu item not found' });

    res.json({
      menu,
      ingredients,
      modifierGroups,
      comboGroups
    });
  } catch (err) {
    console.error('Error fetching menu config:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Categories & Ingredients ---
app.get('/api/categories', async (req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { name_en: 'asc' } });
  res.json(categories);
});

app.post('/api/categories', authenticate, async (req, res) => {
  const { name_en, name_ar } = req.body;
  const category = await prisma.category.create({
    data: { name_en, name_ar }
  });
  res.json(category);
});

app.get('/api/ingredients', async (req, res) => {
  const ingredients = await prisma.ingredient.findMany({ orderBy: { name_en: 'asc' } });
  res.json(ingredients);
});

app.post('/api/ingredients', authenticate, async (req, res) => {
  const { name_en, name_ar } = req.body;
  const ingredient = await prisma.ingredient.create({
    data: { name_en, name_ar }
  });
  res.json(ingredient);
});

// --- Orders ---
app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { admin_id: req.user.id },
      orderBy: { created_at: 'desc' },
      include: {
        table: true,
        order_items: {
          include: { menu: true }
        }
      }
    });
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/orders', orderRateLimit, async (req, res) => {
  const { tableCode, items, adminId, type } = req.body; // Added type

  if (!adminId) return res.status(400).json({ error: 'Restaurant ID required' });
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    return res.status(400).json({ error: 'Order must contain between 1 and 100 items' });
  }
  if (!['dine_in', 'take_away'].includes(type)) {
    return res.status(400).json({ error: 'Invalid order type' });
  }
  if (type === 'dine_in' && !tableCode) {
    return res.status(400).json({ error: 'Table code required for dine-in orders' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const targetAdmin = await tx.admin.findUnique({
        where: { id: adminId },
        select: { id: true, subscription_status: true }
      });
      if (!targetAdmin || !['ACTIVE', 'TRIAL'].includes(targetAdmin.subscription_status)) {
        throw Object.assign(new Error('Restaurant is not accepting orders'), { status: 403 });
      }

      // 1. Resolve the table inside the requested restaurant.
      let table = null;
      if (tableCode) {
        table = await tx.table.findFirst({
          where: {
            admin_id: adminId,
            code: {
              equals: tableCode,
              mode: 'insensitive'
            }
          }
        });
      }

      if (!table && type === 'dine_in') {
        throw Object.assign(new Error('Table not found'), { status: 404 });
      }

      const normalizedItems = items.map(item => ({
        ...item,
        menuId: Number(item.menuId),
        quantity: Number(item.quantity)
      }));
      if (normalizedItems.some(item =>
        !Number.isInteger(item.menuId) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99
      )) {
        throw Object.assign(new Error('Invalid menu item or quantity'), { status: 400 });
      }

      // 2. Load only active menu items owned by this restaurant.
      const menuIds = [...new Set(normalizedItems.map(item => item.menuId))];
      const menuItemsFromDb = await tx.menu.findMany({
        where: {
          id: { in: menuIds },
          user_id: adminId,
          deleted_at: null,
          available: true
        }
      });
      if (menuItemsFromDb.length !== menuIds.length) {
        throw Object.assign(new Error('One or more menu items are unavailable'), { status: 400 });
      }
      const priceMap = new Map(menuItemsFromDb.map(item => [item.id, item.price]));

      const ingredientSelections = normalizedItems.flatMap(item =>
        (Array.isArray(item.ingredients) ? item.ingredients.flat() : [])
          .filter(selection => selection?.action === 'extra')
          .map(selection => ({
            menuId: item.menuId,
            ingredientId: Number(selection.ingredientId),
            quantity: Number(selection.qty || 1)
          }))
      );
      const configuredExtras = ingredientSelections.length
        ? await tx.menuIngredient.findMany({
            where: {
              OR: ingredientSelections.map(selection => ({
                menu_id: selection.menuId,
                ingredient_id: selection.ingredientId
              }))
            }
          })
        : [];
      const extrasMap = new Map(configuredExtras.map(extra => [
        `${extra.menu_id}:${extra.ingredient_id}`,
        extra
      ]));

      let total = 0;
      const orderItemsData = normalizedItems.map(item => {
        const basePrice = priceMap.get(item.menuId);
        const requestedExtras = (Array.isArray(item.ingredients) ? item.ingredients.flat() : [])
          .filter(selection => selection?.action === 'extra');
        let extrasTotal = 0;

        for (const selection of requestedExtras) {
          const configured = extrasMap.get(`${item.menuId}:${Number(selection.ingredientId)}`);
          const extraQty = Number(selection.qty || 1);
          if (
            !configured?.extra_available ||
            !Number.isInteger(extraQty) ||
            extraQty < 1 ||
            extraQty > configured.max_extra
          ) {
            throw Object.assign(new Error('Invalid ingredient customization'), { status: 400 });
          }
          extrasTotal += Number(configured.extra_price_override || 0) * extraQty;
        }

        const price = Number(basePrice) + extrasTotal;
        if (!Number.isFinite(price)) {
          throw Object.assign(new Error(`Invalid price for menu item ${item.menuId}`), { status: 400 });
        }
        const itemTotal = price * item.quantity;
        total += itemTotal;
        return {
          menu_id: item.menuId,
          quantity: item.quantity,
          price_at_order: price,
          note: item.notes
        };
      });

      const orderData = {
        total: Number(total.toFixed(2)),
        status: 'pending',
        type,
        admin: { connect: { id: adminId } }
      };

      if (table) {
        orderData.table = { connect: { id: table.id } };
        // Admin is implicitly linked via table if we wanted, but safer to link explicitly
      }

      const order = await tx.order.create({
        data: orderData
      });

      // 4. Create Order Items
      if (orderItemsData.length > 0) {
        await tx.orderItem.createMany({
          data: orderItemsData.map(itemData => ({
            ...itemData,
            order_id: order.id,
          }))
        });
      }

      if (table && table.status !== 'occupied') {
        await tx.table.update({
          where: { id: table.id },
          data: { status: 'occupied' }
        });
      }
      return order;
    });

    // Emit real-time update to the admin and return the complete order.
    let fullOrder = result;
    if (result && result.admin_id) {
      fullOrder = await prisma.order.findUnique({
        where: { id: result.id },
        include: {
          table: true,
          order_items: { include: { menu: true } }
        }
      });
      io.to(`admin_${result.admin_id}`).emit('new-order', fullOrder);
      if (fullOrder?.table) {
        io.to(`admin_${result.admin_id}`).emit('table-updated', {
          ...fullOrder.table,
          status: 'occupied'
        });
      }
    }

    res.status(201).json(fullOrder);
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.put('/api/orders/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;
  const allowedStatuses = new Set(['pending', 'preparing', 'ready', 'served', 'cancelled']);
  if (!allowedStatuses.has(status)) return res.status(400).json({ error: 'Invalid order status' });
  try {
    const ownedOrder = await prisma.order.findFirst({
      where: { id: Number(req.params.id), admin_id: req.user.id },
      select: { id: true }
    });
    if (!ownedOrder) return res.status(404).json({ error: 'Order not found' });

    const order = await prisma.order.update({
      where: { id: Number(req.params.id) },
      data: { status }
    });

    let releasedTable = null;
    if (order.table_id && ['served', 'cancelled'].includes(status)) {
      const activeOrders = await prisma.order.count({
        where: {
          table_id: order.table_id,
          id: { not: order.id },
          status: { in: ['pending', 'preparing', 'ready'] }
        }
      });
      if (activeOrders === 0) {
        releasedTable = await prisma.table.update({
          where: { id: order.table_id },
          data: { status: 'available' }
        });
      }
    }
    // Emit to customer tracking this order
    io.to(`order_${order.id}`).emit('order-status-updated', { status });
    // Emit to admin dashboard
    if (order.admin_id) {
      io.to(`admin_${order.admin_id}`).emit('order-updated', order);
      if (releasedTable) {
        io.to(`admin_${order.admin_id}`).emit('table-updated', releasedTable);
      }
    }
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Tables ---
app.get('/api/tables', authenticate, async (req, res) => {
  const tables = await prisma.table.findMany({
    where: { admin_id: req.user.id },
    orderBy: { created_at: 'asc' }
  });
  res.json(tables);
});

app.post('/api/tables', authenticate, async (req, res) => {
  const { code, number, capacity } = req.body;
  const admin_id = req.user.id; // Get user ID from authenticated token
  // Handle frontend sending 'number' instead of 'code'
  const tableCode = code || number;

  try {
    // 🆕 Enforce Table Limit
    const admin = await prisma.admin.findUnique({
      where: { id: admin_id },
      select: { max_tables: true }
    });

    const currentCount = await prisma.table.count({
      where: { admin_id }
    });

    if (admin && currentCount >= admin.max_tables) {
      return res.status(403).json({
        error: `Table limit reached for your plan (limit: ${admin.max_tables}). Please upgrade to add more.`
      });
    }

    const table = await prisma.table.create({
      data: { code: tableCode, capacity: Number(capacity), admin_id }
    });
    res.json(table);
  } catch (err) {
    console.error('Error creating table:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tables/:id', authenticate, async (req, res) => {
  const { code, capacity, status } = req.body;
  try {
    const ownedTable = await prisma.table.findFirst({
      where: { id: Number(req.params.id), admin_id: req.user.id },
      select: { id: true }
    });
    if (!ownedTable) return res.status(404).json({ error: 'Table not found' });

    const table = await prisma.table.update({
      where: { id: Number(req.params.id) },
      data: { code, capacity: Number(capacity), status }
    });
    res.json(table);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tables/:id', authenticate, async (req, res) => {
  try {
    const tableId = Number(req.params.id);
    const table = await prisma.table.findUnique({ where: { id: tableId } });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    if (table.admin_id !== req.user.id) {
      return res.status(404).json({ error: 'Table not found' });
    }

    if (table.status === 'occupied') {
      return res.status(400).json({ error: 'Cannot delete an occupied table' });
    }

    await prisma.table.delete({ where: { id: tableId } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public endpoint for QR code access (No auth required)
app.get('/api/tables/public/:code', async (req, res) => {
  try {
    const tables = await prisma.table.findMany({
      where: {
        ...(req.query.adminId ? { admin_id: req.query.adminId } : {}),
        code: {
          equals: req.params.code,
          mode: 'insensitive'
        }
      },
      take: 2
    });
    if (tables.length > 1) {
      return res.status(409).json({ error: 'Ambiguous table code. Please scan a current QR code.' });
    }
    const table = tables[0];
    if (!table) return res.status(404).json({ error: 'Table not found' });
    res.json(table);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🆕 Public endpoint for customer pricing settings (No auth required)
// Customers access this via table code from QR code URL
app.get('/api/public/pricing', async (req, res) => {
  try {
    const tableCode = req.query.table;
    const adminId = req.query.adminId;
    if (!tableCode) {
      return res.status(400).json({ error: 'Table code required' });
    }

    // Find table and get admin
    const tables = await prisma.table.findMany({
      where: {
        ...(adminId ? { admin_id: adminId } : {}),
        code: {
          equals: tableCode,
          mode: 'insensitive'
        }
      },
      select: { id: true, admin_id: true, status: true },
      take: 2
    });
    if (tables.length > 1) {
      return res.status(409).json({ error: 'Ambiguous table code. Please scan a current QR code.' });
    }
    const table = tables[0];

    if (!table || !table.admin_id) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Get admin's pricing and billing settings
    const admin = await prisma.admin.findUnique({
      where: { id: table.admin_id },
      select: {
        id: true,
        restaurant_name: true,  // 🆕 For customer menu header
        logo_url: true,          // 🆕 For customer menu header  
        pricing_prefs: true,
        billing_settings: true
      }
    });

    if (!admin) {
      return res.status(404).json({ error: 'Restaurant settings not found' });
    }

    res.json(admin);
  } catch (err) {
    console.error('Public pricing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 🆕 Public endpoint for customer menu (No auth required)
app.get('/api/public/menus', async (req, res) => {
  const adminId = req.query.adminId;
  if (!adminId) {
    return res.status(400).json({ error: 'Admin ID required' });
  }

  try {
    const menus = await prisma.menu.findMany({
      where: {
        user_id: adminId,
        deleted_at: null
      },
      orderBy: { created_at: 'desc' },
      include: {
        category: true,
        menu_ingredients: {
          include: { ingredient: true }
        },
        menu_modifier_groups: true // Include this to check for modifiers
      }
    });

    const mapped = menus.map(m => ({
      ...m,
      categories: m.category,
      ingredients_details: m.menu_ingredients,
      // Dynamically compute has_modifiers since the DB field might be stale
      has_modifiers: (m.menu_modifier_groups && m.menu_modifier_groups.length > 0) || m.has_modifiers
    }));

    res.json(mapped);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Admin ---
app.get('/api/admin/profile', authenticate, async (req, res) => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: req.user.id },
      select: publicAdminSelect
    });
    res.json(admin);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- User Management (Super Admin) ---
app.get('/api/admins', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const admins = await prisma.admin.findMany({
      orderBy: { created_at: 'desc' },
      select: publicAdminSelect
    });
    res.json(admins);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admins', authRateLimit, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { password, restaurant_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const targetUser = await prisma.admin.findUnique({ where: { email } });
    if (targetUser) return res.status(409).json({ error: 'An account with this email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: { email, password: hashedPassword, restaurant_name },
      select: publicAdminSelect
    });
    res.status(201).json(admin);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admins/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.admin.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/profile', authenticate, async (req, res) => {
  const allowedFields = [
    'restaurant_name', 'logo_url', 'phone', 'address', 'description', 'preferred_language'
  ];
  const updates = Object.fromEntries(
    allowedFields
      .filter(field => req.body[field] !== undefined)
      .map(field => [field, req.body[field]])
  );
  try {
    const admin = await prisma.admin.update({
      where: { id: req.user.id },
      data: updates,
      select: publicAdminSelect
    });
    res.json(admin);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/analytics', authenticate, async (req, res) => {
  const { days } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (Number(days) || 30));

  try {
    const orders = await prisma.order.findMany({
      where: {
        admin_id: req.user.id,
        created_at: { gte: startDate }
      },
      orderBy: { created_at: 'desc' },
      include: {
        order_items: {
          include: { menu: true }
        }
      }
    });
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/monetary', authenticate, async (req, res) => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: req.user.id },
      select: { id: true, pricing_prefs: true, billing_settings: true }
    });
    res.json(admin);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/pricing', authenticate, async (req, res) => {
  const { pricing_prefs } = req.body;
  try {
    await prisma.admin.update({ where: { id: req.user.id }, data: { pricing_prefs } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/billing', authenticate, async (req, res) => {
  const { billing_settings } = req.body;
  try {
    await prisma.admin.update({ where: { id: req.user.id }, data: { billing_settings } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Promotions ---
app.get('/api/promotions', authenticate, async (req, res) => {
  try {
    const promos = await prisma.promotion.findMany({
      where: { admin_id: req.user.id },
      orderBy: { created_at: 'desc' }
    });
    res.json(promos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/promotions', authenticate, async (req, res) => {
  const { id } = req.body;
  const code = String(req.body.code || '').trim().toUpperCase();
  const type = req.body.type;
  const value = Number(req.body.value);
  const appliesTo = req.body.applies_to || 'global';

  if (!code || !['percent', 'fixed'].includes(type) || !Number.isFinite(value) || value < 0) {
    return res.status(400).json({ error: 'Invalid promotion' });
  }
  if (type === 'percent' && value > 100) {
    return res.status(400).json({ error: 'Percentage discount cannot exceed 100' });
  }
  if (!['global', 'table'].includes(appliesTo)) {
    return res.status(400).json({ error: 'Invalid promotion scope' });
  }

  try {
    const tableId = appliesTo === 'table' ? Number(req.body.table_id) : null;
    if (appliesTo === 'table') {
      const ownedTable = await prisma.table.findFirst({
        where: { id: tableId, admin_id: req.user.id },
        select: { id: true }
      });
      if (!ownedTable) return res.status(400).json({ error: 'Invalid promotion table' });
    }

    const data = {
      code,
      type,
      value,
      min_order: req.body.min_order == null ? null : Number(req.body.min_order),
      start_at: req.body.start_at ? new Date(req.body.start_at) : null,
      end_at: req.body.end_at ? new Date(req.body.end_at) : null,
      usage_limit: req.body.usage_limit ? Number(req.body.usage_limit) : null,
      active: req.body.active !== false,
      applies_to: appliesTo,
      table_id: tableId
    };

    let promo;
    if (id) {
      const ownedPromo = await prisma.promotion.findFirst({
        where: { id, admin_id: req.user.id },
        select: { id: true }
      });
      if (!ownedPromo) return res.status(404).json({ error: 'Promotion not found' });
      promo = await prisma.promotion.update({
        where: { id },
        data
      });
    } else {
      promo = await prisma.promotion.create({
        data: { ...data, admin_id: req.user.id }
      });
    }
    res.json(promo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/promotions/:id/active', authenticate, async (req, res) => {
  const { active } = req.body;
  try {
    const ownedPromo = await prisma.promotion.findFirst({
      where: { id: req.params.id, admin_id: req.user.id },
      select: { id: true }
    });
    if (!ownedPromo) return res.status(404).json({ error: 'Promotion not found' });

    await prisma.promotion.update({
      where: { id: req.params.id },
      data: { active }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/settings', authenticate, async (req, res) => {
  const admin = await prisma.admin.findUnique({
    where: { id: req.user.id },
    select: { id: true, order_rules: true, kds_prefs: true }
  });
  res.json(admin);
});

app.put('/api/admin/settings/order-rules', authenticate, async (req, res) => {
  const { order_rules } = req.body;
  await prisma.admin.update({
    where: { id: req.user.id },
    data: { order_rules }
  });
  res.json({ success: true });
});

app.put('/api/admin/settings/kds-prefs', authenticate, async (req, res) => {
  const { kds_prefs } = req.body;
  await prisma.admin.update({
    where: { id: req.user.id },
    data: { kds_prefs }
  });
  res.json({ success: true });
});

app.put('/api/admin/theme', authenticate, async (req, res) => {
  const { theme, theme_mode, theme_color, font_family } = req.body;
  try {
    const updated = await prisma.admin.update({
      where: { id: req.user.id },
      data: { theme, theme_mode, theme_color, font_family },
      select: publicAdminSelect
    });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Uploads ---
app.post('/api/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // In prod, upload to S3 here. For now, return local path.
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

app.delete('/api/upload/:filename', authenticate, async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (filename !== req.params.filename) return res.status(400).json({ error: 'Invalid filename' });
  const filepath = path.join('uploads', filename);
  try {
    await unlink(filepath);
    res.json({ success: true });
  } catch (err) {
    // If file doesn't exist, just return success
    if (err.code === 'ENOENT') return res.json({ success: true });
    res.status(500).json({ error: err.message });
  }
});

// --- Super Admin Routes ---
app.post('/api/super-admin/login', authRateLimit, async (req, res) => {
  const { email, password } = req.body;
  try {
    const superAdmin = await prisma.superAdmin.findUnique({ where: { email } });

    if (!superAdmin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!(await bcrypt.compare(password, superAdmin.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await prisma.superAdmin.update({
      where: { id: superAdmin.id },
      data: { last_login: new Date() }
    });

    const token = jwt.sign(
      { id: superAdmin.id, email: superAdmin.email, role: 'SUPER_ADMIN' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: superAdmin.id, email: superAdmin.email, name: superAdmin.name, role: 'SUPER_ADMIN' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all restaurants with subscription info
app.get('/api/super-admin/restaurants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const restaurants = await prisma.admin.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        email: true,
        restaurant_name: true,
        subscription_plan: true,
        subscription_status: true,
        subscription_end: true,
        trial_ends_at: true,
        max_tables: true,
        max_menu_items: true,
        max_staff_accounts: true,
        created_at: true,
        _count: {
          select: {
            menus: { where: { deleted_at: null } },
            tables: true,
            orders: true
          }
        }
      }
    });

    res.json(restaurants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get platform stats
app.get('/api/super-admin/stats', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const totalRestaurants = await prisma.admin.count();
    const activeRestaurants = await prisma.admin.count({
      where: { subscription_status: 'ACTIVE' }
    });

    // Calculate MRR (Monthly Recurring Revenue)
    const restaurants = await prisma.admin.findMany({
      where: { subscription_status: 'ACTIVE' },
      select: { subscription_plan: true }
    });

    const planPrices = { STANDARD: 10, BASIC: 29, PRO: 79 };
    const totalRevenue = restaurants.reduce((sum, r) => {
      return sum + (planPrices[r.subscription_plan] || 0);
    }, 0);

    // Growth calculation (simplified - compare last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentSignups = await prisma.admin.count({
      where: { created_at: { gte: thirtyDaysAgo } }
    });
    const growth = totalRestaurants > 0 ? Math.round((recentSignups / totalRestaurants) * 100) : 0;

    res.json({
      totalRestaurants,
      activeRestaurants,
      totalRevenue,
      growth
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update restaurant subscription plan
app.put('/api/super-admin/restaurants/:id/plan', authenticate, requireSuperAdmin, async (req, res) => {
  const { plan, status, subscription_end } = req.body;
  const restaurantId = req.params.id;
  const allowedPlans = new Set(['STANDARD', 'BASIC', 'PRO']);
  const allowedStatuses = new Set(['ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIAL']);
  if (!allowedPlans.has(plan) || (status && !allowedStatuses.has(status))) {
    return res.status(400).json({ error: 'Invalid subscription plan or status' });
  }

  try {
    // Plan limits based on tier
    const planLimits = {
      STANDARD: { max_tables: 10, max_menu_items: 50, max_staff_accounts: 1 },
      BASIC: { max_tables: 25, max_menu_items: 150, max_staff_accounts: 3 },
      PRO: { max_tables: 999999, max_menu_items: 999999, max_staff_accounts: 10 }
    };

    const limits = planLimits[plan] || planLimits.STANDARD;

    const updated = await prisma.admin.update({
      where: { id: restaurantId },
      data: {
        subscription_plan: plan,
        subscription_status: status || 'ACTIVE',
        subscription_end: subscription_end ? new Date(subscription_end) : null,
        ...limits
      }
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err?.message?.startsWith('Only JPEG')) {
    return res.status(400).json({ error: err.message });
  }
  if (err?.message === 'Origin not allowed by CORS') {
    return res.status(403).json({ error: err.message });
  }
  console.error('Unhandled request error:', err);
  return res.status(500).json({ error: 'Internal server error' });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`)); // 6. Start server
