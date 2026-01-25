// src/hooks/useAdminMonetary.ts
import { useEffect, useState } from 'react';
import { adminService } from '../services/adminService';
import { api } from '../services/api';
import { DEFAULT_PRICING, DEFAULT_BILLING, type PricingPrefs, type BillingSettings } from '../pricing/types';

const CACHE_KEY = 'monetary:v1';

type CacheShape = {
  prefs: PricingPrefs;
  billing: BillingSettings;
  restaurantName?: string;
  logoUrl?: string;
  ts: number;
};

export function useAdminMonetary(adminId?: string) {
  // 1) seed from cache if present
  const seed = () => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as CacheShape;
    } catch { return null; }
  };

  const cached = seed();
  const [prefs, setPrefs] = useState<PricingPrefs>(cached?.prefs ?? DEFAULT_PRICING);
  const [billing, setBilling] = useState<BillingSettings>(cached?.billing ?? DEFAULT_BILLING);
  const [restaurantName, setRestaurantName] = useState<string | null>(cached?.restaurantName ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(cached?.logoUrl ?? null);
  // if we have cache, we can render without loading flicker
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let data;

        // For customers (no adminId), use table code from URL
        if (!adminId) {
          const urlParams = new URLSearchParams(window.location.search);
          const tableCode = urlParams.get('table');

          if (tableCode) {
            // Use public pricing endpoint (no auth required)
            data = await api.get('/public/pricing', { table: tableCode });
          } else {
            // Fallback to defaults if no table code
            data = { pricing_prefs: DEFAULT_PRICING, billing_settings: DEFAULT_BILLING };
          }
        } else {
          // For admin users, use authenticated endpoint
          data = await adminService.getAdminMonetarySettings(adminId);
        }

        if (!alive) return;
        const newPrefs = data?.pricing_prefs ?? DEFAULT_PRICING;
        const newBilling = data?.billing_settings ?? DEFAULT_BILLING;
        const newName = data?.restaurant_name ?? null;
        const newLogo = data?.logo_url ?? null;

        setPrefs(newPrefs);
        setBilling(newBilling);
        setRestaurantName(newName);
        setLogoUrl(newLogo);

        // 2) write-through cache
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          prefs: newPrefs,
          billing: newBilling,
          restaurantName: newName,
          logoUrl: newLogo,
          ts: Date.now()
        }));
      } catch (err) {
        console.warn('Failed to load pricing settings, using defaults:', err);
        // Keep defaults on error
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [adminId]);

  return { prefs, billing, restaurantName, logoUrl, loading };
}