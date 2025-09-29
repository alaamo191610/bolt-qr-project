import type { SupabaseClient } from '@supabase/supabase-js';

export function makeWAAdapters(supabase: SupabaseClient, opts: { adminId: string }) {
  const { adminId } = opts;

  return {
    // ---- MENUS ----
    async addMenuItemByNamePriceAvailable(name_ar: string, price: number, available: boolean) {
      const { data, error } = await supabase
        .from('menus')
        .insert([{ name_ar, price, available, user_id: adminId }]) // <= scope to admin/user
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    async updateMenuPriceByNameILike(nameLike: string, price: number) {
      const { data, error } = await supabase
        .from('menus')
        .update({ price })
        .ilike('name_ar', nameLike)
        .eq('user_id', adminId) // <= guard tenant
        .select('id, name_ar, price');
      if (error) throw error;
      return data;
    },

    async setMenuAvailabilityByNameILike(nameLike: string, available: boolean) {
      const { data, error } = await supabase
        .from('menus')
        .update({ available })
        .ilike('name_ar', nameLike)
        .eq('user_id', adminId) // <= guard tenant
        .select('id, name_ar, available');
      if (error) throw error;
      return data;
    },

    async searchMenuILike(q: string) {
      const { data, error } = await supabase
        .from('menus')
        .select('id, name_ar, price, available')
        .eq('user_id', adminId) // <= guard tenant
        .ilike('name_ar', `%${q}%`)
        .order('created_at', { ascending: true })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },

    // ---- ORDERS ----
    async createOrderViaEdge(table_code: string, items: Array<{ menu_item_id: string; quantity?: number; note?: string }>) {
      const body = {
        tableCode: table_code,
        items: items.map(i => ({ menuId: i.menu_item_id, quantity: i.quantity ?? 1, notes: i.note || undefined })),
        adminId, // <= pass through to your Edge Function
      };
      const { data, error } = await supabase.functions.invoke('super-action', { body });
      if (error) throw error;
      return data; // { order_id, total, items }
    },
  };
}