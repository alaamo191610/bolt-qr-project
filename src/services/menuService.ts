import type { MenuItem, Category } from '../lib/supabase'
import { api } from './api'

// Raw wire shapes match server/prisma/schema.prisma (`Category`, `Ingredient`,
// `Menu`) exactly: Int ids, and Menu.price is a Prisma Decimal, which
// serializes as a string over JSON, not a number.
export interface RawCategory {
  id: number
  admin_id: string
  organization_id: string | null
  branch_id: string | null
  name_en: string
  name_ar: string | null
  sort_order: number | null
  created_at: string
}

export interface RawIngredient {
  id: number
  admin_id: string
  organization_id: string | null
  branch_id: string | null
  name_en: string
  name_ar: string | null
  created_at: string
}

interface RawMenuItem {
  id: number
  user_id: string | null
  organization_id: string | null
  branch_id: string | null
  category_id: number | null
  name_en: string
  name_ar: string | null
  description_en: string | null
  description_ar: string | null
  price: string
  image_url: string | null
  available: boolean | null
  deleted_at: string | null
  created_at: string
  tags: string[]
  is_featured: boolean
  has_modifiers: boolean
  suggested_items_ids: number[]
  categories: RawCategory | null
  ingredients_details: Array<{ menu_id: number; ingredient_id: number; ingredient: RawIngredient }>
}

// The shape every consumer in src/components/menu actually expects: ids as
// strings (every <select>/<option> in this codebase works in strings, and
// GET /menus's own price is a Decimal-as-string) - so the string coercion
// happens once, here, rather than being re-derived (or silently skipped, as
// category_id was before this) at every call site.
export interface AdminMenuItem {
  id: string
  user_id: string | null
  organization_id: string | null
  branch_id: string | null
  category_id: string
  name_en: string
  name_ar: string | null
  description_en: string | null
  description_ar: string | null
  price: number
  image_url: string | null
  available: boolean
  deleted_at: string | null
  created_at: string
  tags: string[]
  is_featured: boolean
  has_modifiers: boolean
  suggested_items_ids: number[]
  categories: AdminCategory | null
  ingredients_details: Array<{ ingredient: AdminIngredient }>
}

const toAdminMenuItem = (item: RawMenuItem): AdminMenuItem => ({
  ...item,
  id: String(item.id),
  category_id: item.category_id == null ? '' : String(item.category_id),
  price: Number(item.price) || 0,
  available: item.available ?? true,
  categories: item.categories ? { ...item.categories, id: String(item.categories.id) } : null,
  ingredients_details: item.ingredients_details.map(({ ingredient }) => ({
    ingredient: { ...ingredient, id: String(ingredient.id) },
  })),
});

export type AdminCategory = Omit<RawCategory, 'id'> & { id: string }
export type AdminIngredient = Omit<RawIngredient, 'id'> & { id: string }

// GET /public/menus/:id/config (server/index.js) - a distinct query from the
// list endpoints above: `menu` only includes its `category`, not
// `menu_ingredients` (those come back separately as `ingredients`).
interface RawMenuConfigMenu {
  id: number
  name_en: string
  name_ar: string | null
  price: string
  image_url: string | null
  category: RawCategory | null
}

interface RawMenuIngredientRow {
  menu_id: number
  ingredient_id: number
  removable: boolean
  extra_available: boolean
  max_extra: number
  extra_price_override: string | null
  ingredient: RawIngredient
}

interface RawModifierOption {
  id: number
  group_id: number
  name_en: string
  name_ar: string | null
  price_delta: string
  max_qty: number | null
  is_default: boolean | null
}

interface RawModifierGroup {
  id: number
  organization_id: string | null
  name_en: string
  name_ar: string | null
  selection_type: 'single' | 'multi' | null
  min_select: number | null
  max_select: number | null
  required: boolean | null
  modifier_options: RawModifierOption[]
}

interface RawMenuModifierGroup {
  menu_id: number
  group_id: number
  modifier_group: RawModifierGroup
}

interface RawComboGroupItem {
  id: number
  group_id: number
  child_menu_id: number
  upgrade_price_delta: string
  is_default: boolean | null
  menus: { id: number; name_en: string; price: string } | null
}

interface RawComboGroup {
  id: number
  menu_id: number
  min_select: number | null
  max_select: number | null
  combo_group_items: RawComboGroupItem[]
}

interface RawMenuConfigResponse {
  menu: RawMenuConfigMenu
  ingredients: RawMenuIngredientRow[]
  modifierGroups: RawMenuModifierGroup[]
  comboGroups: RawComboGroup[]
}

// The consuming hook (MenuItemCustomizer.tsx's useMenuConfig) works entirely
// in string ids - same boundary-coercion rule as everywhere else in this file.
export interface MenuConfigMenu {
  id: string; name_en: string; name_ar: string | null; price: number; image_url: string | null
}
export interface MenuConfigIngredientRow {
  menu_id: string; ingredient_id: string; removable: boolean; extra_available: boolean
  max_extra: number; extra_price_override: number | null
  ingredient: { id: string; name_en: string; name_ar: string | null; extra_price: number }
}
export interface MenuConfigModifierOption {
  id: string; name_en: string; name_ar: string | null; price_delta: number
  max_qty: number | null; is_default: boolean
}
export interface MenuConfigModifierGroup {
  id: string; name_en: string; name_ar: string | null
  selection_type: 'single' | 'multi'; min_select: number; max_select: number; required: boolean
  modifier_options: MenuConfigModifierOption[]
}
export interface MenuConfigMenuModifierGroup {
  menu_id: string; modifier_group: MenuConfigModifierGroup
}
export interface MenuConfigComboGroup {
  id: string; menu_id: string; min_select: number; max_select: number
  combo_group_items: Array<{
    child_menu_id: string; is_default: boolean; upgrade_price_delta: number
    menus?: { id: string; name_en: string; price: number }
  }>
}
export interface MenuConfigResponse {
  menu: MenuConfigMenu
  ingredients: MenuConfigIngredientRow[]
  modifierGroups: MenuConfigMenuModifierGroup[]
  comboGroups: MenuConfigComboGroup[]
}

const toMenuConfigResponse = (raw: RawMenuConfigResponse): MenuConfigResponse => ({
  menu: {
    id: String(raw.menu.id),
    name_en: raw.menu.name_en,
    name_ar: raw.menu.name_ar,
    price: Number(raw.menu.price) || 0,
    image_url: raw.menu.image_url,
  },
  ingredients: raw.ingredients.map(row => ({
    menu_id: String(row.menu_id),
    ingredient_id: String(row.ingredient_id),
    removable: row.removable,
    extra_available: row.extra_available,
    max_extra: row.max_extra,
    extra_price_override: row.extra_price_override == null ? null : Number(row.extra_price_override),
    ingredient: {
      id: String(row.ingredient.id),
      name_en: row.ingredient.name_en,
      name_ar: row.ingredient.name_ar,
      extra_price: 0,
    },
  })),
  modifierGroups: raw.modifierGroups.map(row => ({
    menu_id: String(row.menu_id),
    modifier_group: {
      id: String(row.modifier_group.id),
      name_en: row.modifier_group.name_en,
      name_ar: row.modifier_group.name_ar,
      selection_type: row.modifier_group.selection_type || 'single',
      min_select: row.modifier_group.min_select ?? 0,
      max_select: row.modifier_group.max_select ?? 1,
      required: row.modifier_group.required ?? false,
      modifier_options: row.modifier_group.modifier_options.map(option => ({
        id: String(option.id),
        name_en: option.name_en,
        name_ar: option.name_ar,
        price_delta: Number(option.price_delta) || 0,
        max_qty: option.max_qty,
        is_default: option.is_default ?? false,
      })),
    },
  })),
  comboGroups: raw.comboGroups.map(group => ({
    id: String(group.id),
    menu_id: String(group.menu_id),
    min_select: group.min_select ?? 1,
    max_select: group.max_select ?? 1,
    combo_group_items: group.combo_group_items.map(item => ({
      child_menu_id: String(item.child_menu_id),
      is_default: item.is_default ?? false,
      upgrade_price_delta: Number(item.upgrade_price_delta) || 0,
      menus: item.menus
        ? { id: String(item.menus.id), name_en: item.menus.name_en, price: Number(item.menus.price) || 0 }
        : undefined,
    })),
  })),
});

export const menuService = {
  // Get all menu items with categories. Admin view (no adminId) hits the
  // authenticated endpoint; customer view (adminId provided) hits the public
  // one - both map to the same shape server-side (server/index.js).
  async getMenuItems(adminId?: string): Promise<AdminMenuItem[]> {
    try {
      const endpoint = adminId ? `/public/menus?adminId=${adminId}` : '/menus';
      const items = await api.get<RawMenuItem[]>(endpoint);
      return (items || []).map(toAdminMenuItem);
    } catch (error) {
      console.error('Error fetching menu items:', error)
      throw error
    }
  },

  // Get categories
  async getCategories(): Promise<AdminCategory[]> {
    try {
      const categories = await api.get<RawCategory[]>('/categories');
      return categories.map(c => ({ ...c, id: String(c.id) }));
    } catch (error) {
      console.error('Error fetching categories:', error)
      throw error
    }
  },

  // Get ingredients
  async getIngredients(): Promise<AdminIngredient[]> {
    try {
      const ingredients = await api.get<RawIngredient[]>('/ingredients');
      return ingredients.map(i => ({ ...i, id: String(i.id) }));
    } catch (error) {
      console.error('Error fetching ingredients:', error)
      throw error
    }
  },

  // Add new ingredient
  async addIngredient(ingredient: { name_en: string; name_ar: string }): Promise<AdminIngredient> {
    try {
      const created = await api.post<RawIngredient>('/ingredients', ingredient);
      return { ...created, id: String(created.id) };
    } catch (error) {
      console.error('Error adding ingredient:', error)
      throw error
    }
  },

  // Add new menu item
  async addMenuItem(item: Omit<MenuItem, 'id' | 'created_at'>) {
    try {
      // Note: In a real app, user_id comes from the auth token on the backend
      // For now, we assume the item object passed in has user_id or backend handles it
      return await api.post<RawMenuItem>('/menus', item);
    } catch (error) {
      console.error('Error adding menu item:', error)
      throw error
    }
  },

  // Update menu item
  async updateMenuItem(id: string, updates: Partial<MenuItem>) {
    try {
      return await api.put<RawMenuItem>(`/menus/${id}`, updates);
    } catch (error) {
      console.error('Error updating menu item:', error)
      throw error
    }
  },

  // Soft delete menu item
  async deleteMenuItem(id: string, hard: boolean = false): Promise<{ success: boolean }> {
    try {
      return await api.delete<{ success: boolean }>(`/menus/${id}${hard ? '?hard=true' : ''}`);
    } catch (error) {
      console.error('Error deleting menu item:', error)
      throw error
    }
  },

  // Clear all menu data (Hard Delete All)
  async clearAllMenuData(): Promise<{ success: boolean }> {
    try {
      return await api.delete<{ success: boolean }>('/admin/reset-menu');
    } catch (error) {
      console.error('Error clearing menu data:', error)
      throw error
    }
  },

  // Add new category
  async addCategory(category: Omit<Category, 'id'>): Promise<AdminCategory> {
    try {
      const created = await api.post<RawCategory>('/categories', category);
      return { ...created, id: String(created.id) };
    } catch (error) {
      console.error('Error adding category:', error)
      throw error
    }
  },

  // Toggle menu item availability (quick action)
  async toggleAvailability(id: string, available: boolean) {
    try {
      return await api.put<RawMenuItem>(`/menus/${id}`, { available });
    } catch (error) {
      console.error('Error toggling availability:', error)
      throw error
    }
  },

  // Get detailed menu configuration for customization (public)
  async getMenuConfig(menuId: string): Promise<MenuConfigResponse> {
    try {
      const raw = await api.get<RawMenuConfigResponse>(`/public/menus/${menuId}/config`);
      return toMenuConfigResponse(raw);
    } catch (error) {
      console.error('Error fetching menu config:', error)
      throw error
    }
  }
}
