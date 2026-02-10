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

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-me';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, restrict this to your frontend domain
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-admin', (adminId) => {
    socket.join(`admin_${adminId}`);
    console.log(`Socket ${socket.id} joined admin_${adminId}`);
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

const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// --- Middleware to simulate auth (Replace with real JWT verification) ---
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

// --- Auth Routes ---
app.post('/api/auth/login', async (req, res) => {
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
    const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: admin.id, email: admin.email, name: admin.restaurant_name } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Menus ---
app.get('/api/menus', authenticate, async (req, res) => {
  try {
    const menus = await prisma.menu.findMany({
      where: { deleted_at: null },
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
  try {
    const result = await prisma.$transaction(async (tx) => {
      const menu = await tx.menu.update({
        where: { id: Number(req.params.id) },
        data: {
          name_en, name_ar, price, category_id: Number(category_id), image_url, available
        }
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
  try {
    if (req.query.hard === 'true') {
      await prisma.menu.delete({ where: { id: Number(req.params.id) } });
    } else {
      await prisma.menu.update({
        where: { id: Number(req.params.id) },
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
    const [allIngredients, allMenus, menuIngredients, menuModifierGroups, comboGroups] = await Promise.all([
      prisma.ingredient.findMany({ orderBy: { name_en: 'asc' } }),
      prisma.menu.findMany({
        where: { deleted_at: null },
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
    await prisma.$transaction(async (tx) => {
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/menus/:id/combos', authenticate, async (req, res) => {
  const menuId = Number(req.params.id);
  const { combo } = req.body;
  try {
    await prisma.$transaction(async (tx) => {
      let groupId = combo.id ? Number(combo.id) : undefined;
      const data = {
        menu_id: menuId,
        min_select: combo.min_select,
        max_select: combo.max_select
      };

      if (groupId) {
        await tx.comboGroup.update({ where: { id: groupId }, data });
      } else {
        const newG = await tx.comboGroup.create({ data });
        groupId = newG.id;
      }

      await tx.comboGroupItem.deleteMany({ where: { group_id: groupId } });
      if (combo.items?.length) {
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
      where: { admin_id: req.query.adminId },
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

app.post('/api/orders', async (req, res) => {
  const { tableCode, items, adminId, type } = req.body; // Added type
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get Table (if provided)
      let table = null;
      if (tableCode) {
        table = await tx.table.findFirst({
          where: {
            code: {
              equals: tableCode,
              mode: 'insensitive'
            }
          }
        });
      }

      const isTakeAway = type === 'take_away';

      if (!table && !isTakeAway && tableCode) {
        // Only throw if table was requested but not found, and it's not takeaway with optional table
        throw new Error('Table not found');
      }

      // 2. Get menu item prices from DB to ensure price integrity
      const menuIds = items.map(item => Number(item.menuId)).filter(id => !isNaN(id));
      if (menuIds.length !== items.length) {
        throw new Error('Invalid menu item ID provided.');
      }
      const menuItemsFromDb = await tx.menu.findMany({
        where: { id: { in: menuIds } }
      });
      const priceMap = new Map(menuItemsFromDb.map(item => [item.id, item.price]));

      let total = 0;
      const orderItemsData = items.map(item => {
        const price = priceMap.get(Number(item.menuId));
        if (price === undefined) {
          throw new Error(`Menu item with ID ${item.menuId} not found.`);
        }
        const itemTotal = price * item.quantity;
        total += itemTotal;
        return {
          menu_id: Number(item.menuId),
          quantity: item.quantity,
          price_at_order: price, // Use real price from DB
          note: item.notes
        };
      });

      // 3. Create Order
      // Use table.admin_id if available, otherwise fallback (e.g. for takeaway without table, might need adminId passed explicitly)
      // For now assuming table provides admin_id, OR adminId is passed in body for takeaway
      const targetAdminId = table?.admin_id || adminId || 'da895696-3f74-42cb-847e-cb9983949f57'; // Remove fallback in prod

      const orderData = {
        total: total,
        status: 'pending',
        type: type || 'dine_in'
      };

      if (table) {
        orderData.table = { connect: { id: table.id } };
        // Admin is implicitly linked via table if we wanted, but safer to link explicitly
      }

      if (targetAdminId) {
        orderData.admin = { connect: { id: targetAdminId } };
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
      return order;
    });

    // Emit real-time update to the admin
    if (result && result.admin_id) {
      // Re-fetch full order with includes to match GET /api/orders format for frontend convenience
      const fullOrder = await prisma.order.findUnique({
        where: { id: result.id },
        include: {
          table: true,
          order_items: { include: { menu: true } }
        }
      });
      io.to(`admin_${result.admin_id}`).emit('new-order', fullOrder);
    }

    res.json(result);
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;
  try {
    const order = await prisma.order.update({
      where: { id: Number(req.params.id) },
      data: { status }
    });
    // Emit to customer tracking this order
    io.to(`order_${order.id}`).emit('order-status-updated', { status });
    // Emit to admin dashboard
    if (order.admin_id) {
      io.to(`admin_${order.admin_id}`).emit('order-updated', order);
    }
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Tables ---
app.get('/api/tables', authenticate, async (req, res) => {
  const tables = await prisma.table.findMany({
    where: { admin_id: req.query.adminId },
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
    const table = await prisma.table.findFirst({
      where: {
        code: {
          equals: req.params.code,
          mode: 'insensitive'
        }
      }
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    res.json(table);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🆕 Public endpoint for customer pricing settings (No auth required)
// Customers access this via table code from QR code URL
app.get('/api/public/pricing', async (req, res) => {
  try {
    const tableCode = req.query.table;
    if (!tableCode) {
      return res.status(400).json({ error: 'Table code required' });
    }

    // Find table and get admin
    const table = await prisma.table.findFirst({
      where: {
        code: {
          equals: tableCode,
          mode: 'insensitive'
        }
      },
      select: { id: true, admin_id: true, status: true }
    });

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

    // 🆕 Update table status to occupied if available
    if (table.status === 'available') {
      await prisma.table.update({
        where: { id: table.id },
        data: { status: 'occupied' }
      });

      // Emit real-time update to admin
      io.to(`admin_${table.admin_id}`).emit('table-updated', {
        ...table,
        status: 'occupied'
      });
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
  // Use ID from query or fallback to authenticated user's ID
  const id = req.query.id || req.user.id;
  try {
    let admin = await prisma.admin.findUnique({ where: { id } });
    res.json(admin);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- User Management (Super Admin) ---
app.get('/api/admins', authenticate, async (req, res) => {
  try {
    const admins = await prisma.admin.findMany({
      orderBy: { created_at: 'desc' }
    });
    res.json(admins);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admins', async (req, res) => {
  const { email, password, restaurant_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    // Check if target email exists and has a password
    const targetUser = await prisma.admin.findUnique({ where: { email } });
    const isClaimingLegacy = targetUser && !targetUser.password;

    // Check if system is initialized (any admin has password)
    const initializedCount = await prisma.admin.count({
      where: { password: { not: null } }
    });
    const isSystemInitialized = initializedCount > 0;

    // Require Auth if:
    // 1. System is initialized
    // 2. We are creating a NEW user (targetUser is null).
    //    If targetUser exists, we allow password reset/update without auth for recovery.
    // TEMPORARY FIX: Allow creation to unblock migration
    // if (isSystemInitialized && !targetUser) {
    //   const authHeader = req.headers.authorization;
    //   if (!authHeader) return res.sendStatus(401);
    //   const token = authHeader.split(' ')[1];
    //   try {
    //     jwt.verify(token, JWT_SECRET);
    //   } catch (e) {
    //     console.error("Auth failed during admin creation:", e.message);
    //     return res.sendStatus(403);
    //   }
    // }

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    let admin;
    if (targetUser) {
      // Update existing (legacy or authenticated update)
      admin = await prisma.admin.update({
        where: { email },
        data: {
          password: hashedPassword,
          restaurant_name: restaurant_name || targetUser.restaurant_name
        }
      });
    } else {
      // Create new
      admin = await prisma.admin.create({
        data: {
          email,
          password: hashedPassword,
          restaurant_name,
        },
      });
    }
    res.json(admin);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admins/:id', authenticate, async (req, res) => {
  try {
    await prisma.admin.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/profile', authenticate, async (req, res) => {
  const { id, ...updates } = req.body;
  try {
    const admin = await prisma.admin.update({
      where: { id },
      data: updates
    });
    res.json(admin);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/analytics', authenticate, async (req, res) => {
  const { adminId, days } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (Number(days) || 30));

  try {
    const orders = await prisma.order.findMany({
      where: {
        admin_id: adminId,
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
      where: { id: req.query.adminId },
      select: { id: true, pricing_prefs: true, billing_settings: true }
    });
    res.json(admin);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/pricing', authenticate, async (req, res) => {
  const { id, pricing_prefs } = req.body;
  try {
    await prisma.admin.update({ where: { id }, data: { pricing_prefs } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/billing', authenticate, async (req, res) => {
  const { id, billing_settings } = req.body;
  try {
    await prisma.admin.update({ where: { id }, data: { billing_settings } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Promotions ---
app.get('/api/promotions', authenticate, async (req, res) => {
  try {
    const promos = await prisma.promotion.findMany({
      where: { admin_id: req.query.adminId },
      orderBy: { created_at: 'desc' }
    });
    res.json(promos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/promotions', authenticate, async (req, res) => {
  const { id, admin_id, ...data } = req.body;
  try {
    let promo;
    if (id) {
      promo = await prisma.promotion.update({
        where: { id },
        data
      });
    } else {
      promo = await prisma.promotion.create({
        data: { ...data, admin_id }
      });
    }
    res.json(promo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/promotions/:id/active', authenticate, async (req, res) => {
  const { active } = req.body;
  try {
    await prisma.promotion.update({
      where: { id: req.params.id },
      data: { active }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/settings', authenticate, async (req, res) => {
  const admin = await prisma.admin.findUnique({
    where: { id: req.query.id },
    select: { id: true, order_rules: true, kds_prefs: true }
  });
  res.json(admin);
});

app.put('/api/admin/settings/order-rules', authenticate, async (req, res) => {
  const { order_rules, id } = req.body;
  await prisma.admin.update({
    where: { id },
    data: { order_rules }
  });
  res.json({ success: true });
});

app.put('/api/admin/settings/kds-prefs', authenticate, async (req, res) => {
  const { kds_prefs, id } = req.body;
  await prisma.admin.update({
    where: { id },
    data: { kds_prefs }
  });
  res.json({ success: true });
});

app.put('/api/admin/theme', authenticate, async (req, res) => {
  const { id, theme, theme_mode, theme_color, font_family } = req.body;
  try {
    const updated = await prisma.admin.update({
      where: { id },
      data: { theme, theme_mode, theme_color, font_family }
    });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Uploads ---
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // In prod, upload to S3 here. For now, return local path.
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

app.delete('/api/upload/:filename', authenticate, async (req, res) => {
  const filepath = path.join('uploads', req.params.filename);
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
app.post('/api/super-admin/login', async (req, res) => {
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
app.get('/api/super-admin/restaurants', authenticate, async (req, res) => {
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
app.get('/api/super-admin/stats', authenticate, async (req, res) => {
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
app.put('/api/super-admin/restaurants/:id/plan', authenticate, async (req, res) => {
  const { plan, status, subscription_end } = req.body;
  const restaurantId = req.params.id;

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


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`)); // 6. Start server