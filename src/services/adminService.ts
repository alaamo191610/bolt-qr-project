import { supabase } from '../lib/supabase';
import type { Admin } from '../lib/supabase';
import type { OrderFlowRules, KDSPrefs } from '../order-admin/types';
import type { PricingPrefs, BillingSettings, Promotion } from '../pricing/types';

/** Resolve admin id from param or current session */
async function resolveAdminId(maybeId?: string) {
  if (maybeId) return maybeId;
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user?.id) throw new Error('Not authenticated');
  return user.id;
}

export const adminService = {
  // Get admin profile
  async getAdminProfile(adminId?: string) {
    try {
      const id = await resolveAdminId(adminId);
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    } catch (error) {
      console.error('Error fetching admin profile:', error);
      throw error;
    }
  },

  // Update admin profile
  async updateAdminProfile(adminId: string | undefined, updates: Partial<Admin>) {
    try {
      const id = await resolveAdminId(adminId);
      const { data, error } = await supabase
        .from('admins')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating admin profile:', error);
      throw error;
    }
  },

  // Update admin language preference
  async updateAdminLanguage(adminId: string | undefined, language: 'en' | 'ar') {
    try {
      const id = await resolveAdminId(adminId);
      const { data, error } = await supabase
        .from('admins')
        .update({ preferred_language: language })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating admin language:', error);
      throw error;
    }
  },

  // Get restaurant analytics
  async getAnalytics(adminId: string | undefined, days: number = 30) {
    try {
      const id = await resolveAdminId(adminId);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

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
        .eq('admin_id', id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const totalRevenue = orders?.reduce((sum, order) => sum + (order.total || 0), 0) || 0;
      const totalOrders = orders?.length || 0;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      const itemCounts: Record<string, number> = {};
      orders?.forEach((order: any) => {
        (order.order_items || []).forEach((item: any) => {
          const itemName = item.menus?.name_en || 'Unknown Item';
          itemCounts[itemName] = (itemCounts[itemName] || 0) + item.quantity;
        });
      });

      const popularItems = Object.entries(itemCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      return {
        totalRevenue,
        totalOrders,
        averageOrderValue,
        popularItems,
        orders: orders || [],
      };
    } catch (error) {
      console.error('Error fetching analytics:', error);
      throw error;
    }
  },

  // -------- Order workflow & KDS --------
  async getAdminSettings(adminId?: string) {
    const id = await resolveAdminId(adminId);
    const { data, error } = await supabase
      .from('admins')
      .select('id, order_rules, kds_prefs')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as { id: string; order_rules: OrderFlowRules; kds_prefs: KDSPrefs } | null;
  },

  async saveOrderRules(adminId: string | undefined, order_rules: OrderFlowRules) {
    const id = await resolveAdminId(adminId);
    const { error } = await supabase.from('admins').update({ order_rules }).eq('id', id);
    if (error) throw error;
  },

  async saveKDSPrefs(adminId: string | undefined, kds_prefs: KDSPrefs) {
    const id = await resolveAdminId(adminId);
    const { error } = await supabase.from('admins').update({ kds_prefs }).eq('id', id);
    if (error) throw error;
  },

  // -------- Pricing / Billing --------
  async getAdminMonetarySettings(adminId?: string) {
    const id = await resolveAdminId(adminId);
    const { data, error } = await supabase
      .from('admins')
      .select('id, pricing_prefs, billing_settings')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as {
      id: string;
      pricing_prefs: PricingPrefs | null;
      billing_settings: BillingSettings | null;
    } | null;
  },

  async savePricingPrefs(adminId: string | undefined, pricing_prefs: PricingPrefs) {
    const id = await resolveAdminId(adminId);
    const { error } = await supabase.from('admins').update({ pricing_prefs }).eq('id', id);
    if (error) throw error;
  },

  async saveBillingSettings(adminId: string | undefined, billing_settings: BillingSettings) {
    const id = await resolveAdminId(adminId);
    const { error } = await supabase.from('admins').update({ billing_settings }).eq('id', id);
    if (error) throw error;
  },

  // -------- Promotions --------
  async listPromotions(adminId?: string): Promise<Promotion[]> {
    const id = await resolveAdminId(adminId);
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('admin_id', id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as Promotion[];
  },

  async upsertPromotion(promo: Promotion, adminId?: string): Promise<Promotion> {
    const id = await resolveAdminId(adminId ?? promo.admin_id);
    const payload = { ...promo, admin_id: id };
    const { data, error } = await supabase
      .from('promotions')
      .upsert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as Promotion;
  },

  async setPromotionActive(adminId: string | undefined, id: string, active: boolean) {
    const owner = await resolveAdminId(adminId);
    const { error } = await supabase
      .from('promotions')
      .update({ active })
      .eq('admin_id', owner)
      .eq('id', id);
    if (error) throw error;
  },
};

// ---------- theme helpers (unchanged) ----------
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
    .select('theme, theme_mode, theme_color')
    .eq('id', user.id)
    .single();

  if (error) throw error;

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