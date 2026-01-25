-- Enable UUID extension if using UUIDs for admin_id (common with auth systems)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Admins / Users Table
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  restaurant_name TEXT,
  phone TEXT,
  address TEXT,
  description TEXT,
  order_rules JSONB DEFAULT '{}',
  kds_prefs JSONB DEFAULT '{}',
  pricing_prefs JSONB DEFAULT '{}',
  billing_settings JSONB DEFAULT '{}',
  theme JSONB DEFAULT '{}',
  theme_mode TEXT DEFAULT 'light',
  theme_color TEXT,
  preferred_language TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ingredients
CREATE TABLE IF NOT EXISTS ingredients (
  id SERIAL PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Menus
CREATE TABLE IF NOT EXISTS menus (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES admins(id), -- Link to admin/restaurant owner
  category_id INTEGER REFERENCES categories(id),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  description_en TEXT,
  description_ar TEXT,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  image_url TEXT,
  available BOOLEAN DEFAULT true,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Menu Ingredients (Many-to-Many)
CREATE TABLE IF NOT EXISTS menu_ingredients (
  menu_id INTEGER REFERENCES menus(id),
  ingredient_id INTEGER REFERENCES ingredients(id),
  PRIMARY KEY (menu_id, ingredient_id)
);

-- Tables
CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  admin_id UUID REFERENCES admins(id),
  code TEXT NOT NULL,
  capacity INTEGER DEFAULT 4,
  status TEXT DEFAULT 'available',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(admin_id, code)
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  admin_id UUID REFERENCES admins(id),
  table_id INTEGER REFERENCES tables(id),
  total DECIMAL(10, 2) DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending, preparing, ready, served, cancelled
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  menu_id INTEGER REFERENCES menus(id),
  quantity INTEGER DEFAULT 1,
  price_at_order DECIMAL(10, 2) NOT NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_menus_user_id ON menus(user_id);
CREATE INDEX idx_orders_admin_id ON orders(admin_id);
CREATE INDEX idx_orders_status ON orders(status);