import type { MenuItem, Category } from '../lib/supabase'
import { api } from './api'

export const menuService = {
  // Get all menu items with categories
  async getMenuItems(adminId?: string) {
    try {
      // The backend handles the joins and filtering
      const items = await api.get('/menus', adminId ? { adminId } : undefined);
      return (items || []).map((item: any) => ({
        ...item,
        price: Number(item.price) || 0
      }));
    } catch (error) {
      console.error('Error fetching menu items:', error)
      throw error
    }
  }
  ,

  // Get categories
  async getCategories() {
    try {
      return await api.get('/categories');
    } catch (error) {
      console.error('Error fetching categories:', error)
      throw error
    }
  },

  // Get ingredients
  async getIngredients() {
    try {
      return await api.get('/ingredients');
    } catch (error) {
      console.error('Error fetching ingredients:', error)
      throw error
    }
  },

  // Add new ingredient
  async addIngredient(ingredient: { name_en: string; name_ar: string }) {
    try {
      return await api.post('/ingredients', ingredient);
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
      return await api.post('/menus', item);
    } catch (error) {
      console.error('Error adding menu item:', error)
      throw error
    }
  },

  // Update menu item
  async updateMenuItem(id: string, updates: Partial<MenuItem>) {
    try {
      const res = await fetch(`http://localhost:3000/api/menus/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      return await res.json();
    } catch (error) {
      console.error('Error updating menu item:', error)
      throw error
    }
  },

  // Soft delete menu item
  async deleteMenuItem(id: string) {
    try {
      const res = await fetch(`http://localhost:3000/api/menus/${id}`, { method: 'DELETE' });
      return await res.json();
    } catch (error) {
      console.error('Error deleting menu item:', error)
      throw error
    }
  },

  // Add new category
  async addCategory(category: Omit<Category, 'id'>) {
    try {
      return await api.post('/categories', category);
    } catch (error) {
      console.error('Error adding category:', error)
      throw error
    }
  }
}