import { supabase } from '../lib/supabase'
import type { MenuItem, Category } from '../lib/supabase'

export const menuService = {
  // Get all menu items with categories
  async getMenuItems(adminId?: string) {
    try {
      let query = supabase
        .from('menus')
        .select(`
        *,
        categories (
          id,
          name_en,
          name_ar
        ),
        description_en, description_ar,
        ingredients_details:menu_ingredients (
          ingredient:ingredients (
            id,
            name_en,
            name_ar
          )
        )
      `)
        .is('deleted_at', null)
        .eq('available', true)

      if (adminId) {
        query = query.eq('user_id', adminId)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching menu items:', error)
      throw error
    }
  }
  ,

  // Get categories
  async getCategories() {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name_en')

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching categories:', error)
      throw error
    }
  },

  // Add new menu item
  async addMenuItem(item: Omit<MenuItem, 'id' | 'created_at'>) {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      // Add user_id to the item
      const itemWithUser = { ...item, user_id: user.id }

      const { data, error } = await supabase
        .from('menus')
        .insert([itemWithUser])
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error adding menu item:', error)
      throw error
    }
  },

  // Update menu item
  async updateMenuItem(id: string, updates: Partial<MenuItem>) {
    try {
      const { data, error } = await supabase
        .from('menus')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error updating menu item:', error)
      throw error
    }
  },

  // Soft delete menu item
  async deleteMenuItem(id: string) {
    try {
      const { data, error } = await supabase
        .from('menus')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error deleting menu item:', error)
      throw error
    }
  },

  // Add new category
  async addCategory(category: Omit<Category, 'id'>) {
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert([category])
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error adding category:', error)
      throw error
    }
  }
}