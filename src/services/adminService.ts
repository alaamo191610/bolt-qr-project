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
    try {
      // If adminId is provided, fetch that profile. Otherwise, backend will use the token user.
      return await api.get('/admin/profile', adminId ? { id: adminId } : {});
    } catch (error) {
      console.error('Error fetching admin profile:', error);
      throw error;
    }
  },

  // Update admin profile
  async updateAdminProfile(adminId: string | undefined, updates: Partial<Admin>) {
    try {
      const id = adminId || (await api.get('/admin/profile')).id; // Get self if no ID
      const data = await api.put('/admin/profile', { id, ...updates });
      return data;
    } catch (error) {
      console.error('Error updating admin profile:', error);
      throw error;
    }
  },

  // Update admin language preference
  async updateAdminLanguage(adminId: string | undefined, language: 'en' | 'ar') {
    try {
      const id = adminId || (await api.get('/admin/profile')).id;
      const data = await api.put('/admin/profile', { id, preferred_language: language });
      return data;
    } catch (error) {
      console.error('Error updating admin language:', error);
      throw error;
    }
  },

  // Get restaurant analytics
  async getAnalytics(adminId: string | undefined, days: number = 30) {
    try {
      const id = adminId || (await api.get('/admin/profile')).id;
      const orders = await api.get('/admin/analytics', { adminId: id, days: String(days) });

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
    const id = adminId || (await api.get('/admin/profile')).id;
    return await api.get('/admin/settings', { id });
  },

  async saveOrderRules(adminId: string | undefined, order_rules: OrderFlowRules) {
    const id = adminId || (await api.get('/admin/profile')).id;
    await api.post('/admin/settings/order-rules', { id, order_rules }); // Changed to POST/PUT in backend
  },

  async saveKDSPrefs(adminId: string | undefined, kds_prefs: KDSPrefs) {
    const id = adminId || (await api.get('/admin/profile')).id;
    await api.post('/admin/settings/kds-prefs', { id, kds_prefs });
  },

  // -------- Pricing / Billing --------
  async getAdminMonetarySettings(adminId?: string) {
    const id = adminId || (await api.get('/admin/profile')).id;
    return await api.get('/admin/monetary', { adminId: id });
  },

  async savePricingPrefs(adminId: string | undefined, pricing_prefs: PricingPrefs) {
    const id = adminId || (await api.get('/admin/profile')).id;
    await api.put('/admin/pricing', { id, pricing_prefs });
  },

  async saveBillingSettings(adminId: string | undefined, billing_settings: BillingSettings) {
    const id = adminId || (await api.get('/admin/profile')).id;
    await api.put('/admin/billing', { id, billing_settings });
  },

  // -------- Promotions --------
  async listPromotions(adminId?: string): Promise<Promotion[]> {
    const id = adminId || (await api.get('/admin/profile')).id;
    const data = await api.get('/promotions', { adminId: id });
    return (data || []) as Promotion[];
  },

  async upsertPromotion(promo: Promotion, adminId?: string): Promise<Promotion> {
    const id = adminId || (await api.get('/admin/profile')).id;
    const payload = { ...promo, admin_id: id };
    const data = await api.post('/promotions', payload);
    return data as Promotion;
  },

  async setPromotionActive(adminId: string | undefined, id: string, active: boolean) {
    // We don't strictly need adminId here if the backend checks ownership, 
    // but for now we just pass the ID to the endpoint
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
  const id = (await api.get('/admin/profile')).id;
  const data = await api.get('/admin/profile', { id });

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
  const id = (await api.get('/admin/profile')).id;
  const data = await api.put('/admin/theme', { id, ...patch });

  return {
    theme: data?.theme ?? null,
    theme_mode: data?.theme_mode ?? null,
    theme_color: data?.theme_color ?? null,
  };
}