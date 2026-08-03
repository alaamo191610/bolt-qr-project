import type { Admin } from '../lib/supabase';
import type { OrderFlowRules, KDSPrefs } from '../order-admin/types';
import type { PricingPrefs, BillingSettings, Promotion } from '../pricing/types';
import { api } from './api';

export const adminService = {
  async login(credentials: { email: string; password: string }) {
    return await api.post('/auth/login', credentials);
  },

  // Get admin profile
  async getAdminProfile(adminId?: string) {
    void adminId;
    try {
      return await api.get('/admin/profile');
    } catch (error) {
      console.error('Error fetching admin profile:', error);
      throw error;
    }
  },

  // Update admin profile
  async updateAdminProfile(adminId: string | undefined, updates: Partial<Admin>) {
    void adminId;
    try {
      const data = await api.put('/admin/profile', updates);
      return data;
    } catch (error) {
      console.error('Error updating admin profile:', error);
      throw error;
    }
  },

  // Update admin language preference
  async updateAdminLanguage(adminId: string | undefined, language: 'en' | 'ar') {
    void adminId;
    try {
      const data = await api.put('/admin/profile', { preferred_language: language });
      return data;
    } catch (error) {
      console.error('Error updating admin language:', error);
      throw error;
    }
  },

  // Get restaurant analytics
  async getAnalytics(adminId: string | undefined, days: number = 30) {
    void adminId;
    try {
      const orders = await api.get('/admin/analytics', { days: String(days) });

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
    void adminId;
    return await api.get('/admin/settings');
  },

  async saveOrderRules(adminId: string | undefined, order_rules: OrderFlowRules) {
    void adminId;
    await api.put('/admin/settings/order-rules', { order_rules });
  },

  async saveKDSPrefs(adminId: string | undefined, kds_prefs: KDSPrefs) {
    void adminId;
    await api.put('/admin/settings/kds-prefs', { kds_prefs });
  },

  // -------- Pricing / Billing --------
  async getAdminMonetarySettings(adminId?: string) {
    void adminId;
    return await api.get('/admin/monetary');
  },

  async savePricingPrefs(adminId: string | undefined, pricing_prefs: PricingPrefs) {
    void adminId;
    await api.put('/admin/pricing', { pricing_prefs });
  },

  async saveBillingSettings(adminId: string | undefined, billing_settings: BillingSettings) {
    void adminId;
    await api.put('/admin/billing', { billing_settings });
  },

  // -------- Promotions --------
  async listPromotions(adminId?: string): Promise<Promotion[]> {
    void adminId;
    const data = await api.get('/promotions');
    return (data || []) as Promotion[];
  },

  async upsertPromotion(promo: Promotion, adminId?: string): Promise<Promotion> {
    void adminId;
    const payload: Partial<Promotion> = { ...promo };
    delete payload.admin_id;
    const data = await api.post('/promotions', payload);
    return data as Promotion;
  },

  async setPromotionActive(adminId: string | undefined, id: string, active: boolean) {
    void adminId;
    await api.put(`/promotions/${id}/active`, { active });
  },

  // -------- User Management --------
  async getAllAdmins() {
    try {
      return await api.get('/admins');
    } catch (error) {
      console.error('Error fetching admins:', error);
      throw error;
    }
  },

  async createAdmin(data: {
    email: string;
    password?: string;
    restaurant_name: string;
  }) {
    return await api.post('/admins', data);
  },

  async deleteAdmin(id: string) {
    return await api.delete(`/admins/${id}`);
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
  const data = await api.get('/admin/profile');

  return {
    theme: data?.theme ?? null,
    theme_mode: data?.theme_mode ?? null,
    theme_color: data?.theme_color ?? null,
  };
}

export async function updateAdminTheme(patch: {
  theme?: { primary: string; secondary: string; accent: string };
  theme_mode?: 'light' | 'dark' | 'system';
  font_family?: string;
}) {
  const data = await api.put('/admin/theme', patch);

  return {
    theme: data?.theme ?? null,
    theme_mode: data?.theme_mode ?? null,
    theme_color: data?.theme_color ?? null,
  };
}
