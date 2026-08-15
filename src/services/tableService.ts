import type { Table } from '../lib/supabase'
import { api } from './api'

export interface TableCapabilityRotation {
  capability: string
  tableId: number
  tableCode: string
  version: number
}

export interface TableSessionExchange {
  token: string
  expiresIn: number
  restaurantId: string
  organizationId: string
  table: { id: number; code: string }
}

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

  // Rotate (create or replace) a table's QR capability. Returns the raw
  // secret once — it is never retrievable again after this call returns.
  async rotateCapability(tableId: number | string): Promise<TableCapabilityRotation> {
    try {
      return await api.post(`/tables/${tableId}/capability/rotate`, {});
    } catch (error) {
      console.error('Error rotating table capability:', error)
      throw error
    }
  },

  // Revoke a table's active QR capability, invalidating any table sessions
  // already issued from it. Safe to call again on an already-revoked table.
  async revokeCapability(tableId: number | string): Promise<{ success: boolean }> {
    try {
      return await api.delete(`/tables/${tableId}/capability`);
    } catch (error) {
      console.error('Error revoking table capability:', error)
      throw error
    }
  },

  // Public: exchange a scanned QR capability for a short-lived table-session
  // bearer token. No restaurant/SuperAdmin auth is attached to this call.
  async exchangeTableSession(capability: string): Promise<TableSessionExchange> {
    return await api.postPublic('/public/table-session', { capability });
  }
}
