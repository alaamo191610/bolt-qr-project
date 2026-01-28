import type { Table } from '../lib/supabase'
import { api } from './api'

export const tableService = {
  // Get all tables for admin
  async getTables(adminId: string) {
    try {
      return await api.get('/tables', { adminId });
    } catch (error) {
      console.error('Error fetching tables:', error)
      throw error
    }
  },

  // Add new table
  async addTable(table: Omit<Table, 'id' | 'created_at'>) {
    try {
      // Backend will get admin_id from the token
      return await api.post('/tables', table);
    } catch (error) {
      console.error('Error adding table:', error)
      throw error
    }
  },

  // Update table
  async updateTable(id: string, updates: Partial<Table>) {
    try {
      return await api.put(`/tables/${id}`, updates);
    } catch (error) {
      console.error('Error updating table:', error)
      throw error
    }
  },

  // Delete table
  async deleteTable(id: string) {
    try {
      return await api.delete(`/tables/${id}`);
    } catch (error) {
      console.error('Error deleting table:', error)
      throw error
    }
  },

  // Get table by code
  async getTableByCode(code: string) {
    try {
      return await api.get(`/tables/public/${code}`);
    } catch (error) {
      console.error('Error fetching table by code:', error)
      throw error
    }
  }
}