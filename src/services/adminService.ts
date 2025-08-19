import { supabase } from '../lib/supabase'
import type { Admin } from '../lib/supabase'

export const adminService = {
  // Get admin profile
  async getAdminProfile(adminId: string) {
    try {
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('id', adminId)

      if (error) throw error
      return data?.[0] || null
    } catch (error) {
      console.error('Error fetching admin profile:', error)
      throw error
    }
  },

  // Update admin profile
  async updateAdminProfile(adminId: string, updates: Partial<Admin>) {
    try {
      const { data, error } = await supabase
        .from('admins')
        .update(updates)
        .eq('id', adminId)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error updating admin profile:', error)
      throw error
    }
  },

  // Update admin language preference
  async updateAdminLanguage(adminId: string, language: 'en' | 'ar') {
    try {
      const { data, error } = await supabase
        .from('admins')
        .update({ preferred_language: language })
        .eq('id', adminId)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error updating admin language:', error)
      throw error
    }
  },

  // Get restaurant analytics
  async getAnalytics(adminId: string, days: number = 30) {
    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            quantity,
            price_at_order,
            menus (
              name_en,
              name_ar
            )
          )
        `)
        .eq('admin_id', adminId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })

      if (error) throw error

      // Calculate analytics
      const totalRevenue = orders?.reduce((sum, order) => sum + (order.total || 0), 0) || 0
      const totalOrders = orders?.length || 0
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

      // Popular items
      const itemCounts: { [key: string]: number } = {}
      orders?.forEach((order: any) => {
        (order.order_items || []).forEach((item: any) => {
          const itemName = item.menus?.name_en || 'Unknown Item';
          itemCounts[itemName] = (itemCounts[itemName] || 0) + item.quantity;
        });
      });      

      const popularItems = Object.entries(itemCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }))

      return {
        totalRevenue,
        totalOrders,
        averageOrderValue,
        popularItems,
        orders: orders || []
      }
    } catch (error) {
      console.error('Error fetching analytics:', error)
      throw error
    }
  }
}


export type AdminThemeRow = {
  theme: { primary: string | null; secondary: string | null; accent: string | null } | null;
  theme_mode: 'light' | 'dark' | 'system' | null;
  // keep for legacy fallback:
  theme_color: string | null;
};

export async function fetchAdminTheme(): Promise<AdminThemeRow> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('admins')
    .select('theme, theme_mode, theme_color')  // ⬅️ include theme here
    .eq('id', user.id)
    .single();

  if (error) throw error;

  // ensure all keys exist for TS
  return {
    theme: (data as any)?.theme ?? null,
    theme_mode: (data as any)?.theme_mode ?? null,
    theme_color: (data as any)?.theme_color ?? null,
  };
}

export async function updateAdminTheme(patch: {
  theme?: { primary: string; secondary: string; accent: string };
  theme_mode?: 'light' | 'dark' | 'system';
}) {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('admins')
    .update(patch)
    .eq('id', user.id)
    .select('theme, theme_mode, theme_color')
    .single();

  if (error) throw error;

  return data as AdminThemeRow;
}