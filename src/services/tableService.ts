import { supabase } from '../lib/supabase'
import type { Table } from '../lib/supabase'

export const tableService = {
  // Get all tables for admin
  async getTables(adminId: string) {
    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('admin_id', adminId)
        .order('created_at', { ascending: true })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching tables:', error)
      throw error
    }
  },

  // Add new table
  async addTable(table: Omit<Table, 'id' | 'created_at'>) {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated')
      
      // Add admin_id to the table
      const tableWithAdmin = { ...table, admin_id: user.id }
      
      const { data, error } = await supabase
        .from('tables')
        .insert([tableWithAdmin])
        .select()

      if (error) throw error
      return data?.[0] || null
    } catch (error) {
      console.error('Error adding table:', error)
      throw error
    }
  },

  // Update table
  async updateTable(id: string, updates: Partial<Table>) {
    try {
      const { data, error } = await supabase
        .from('tables')
        .update(updates)
        .eq('id', id)
        .select()

      if (error) throw error
      return data?.[0] || null
    } catch (error) {
      console.error('Error updating table:', error)
      throw error
    }
  },

  // Delete table
  async deleteTable(id: string) {
    try {
      const { data, error } = await supabase
        .from('tables')
        .delete()
        .eq('id', id)
        .select()

      if (error) throw error
      return data?.[0] || null
    } catch (error) {
      console.error('Error deleting table:', error)
      throw error
    }
  },

  // Get table by code
  async getTableByCode(code: string) {
    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('code', code)

      if (error) throw error
      return data?.[0] || null
    } catch (error) {
      console.error('Error fetching table by code:', error)
      throw error
    }
  }
}