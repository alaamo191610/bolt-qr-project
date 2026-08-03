// src/hooks/useAdminMonetary.ts
import { useEffect, useState } from 'react';
import { adminService } from '../services/adminService';
import { api } from '../services/api';
import { DEFAULT_PRICING, DEFAULT_BILLING, type PricingPrefs, type BillingSettings } from '../pricing/types';

export function useAdminMonetary(adminId?: string) {
  const [prefs, setPrefs] = useState<PricingPrefs>(DEFAULT_PRICING);
  const [billing, setBilling] = useState<BillingSettings>(DEFAULT_BILLING);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let data;

        // For customers (no adminId), use table code from URL
        if (!adminId) {
          const urlParams = new URLSearchParams(window.location.search);
          const tableCode = urlParams.get('table');
          const restaurantId = urlParams.get('restaurant');

          if (tableCode) {
            // Use public pricing endpoint (no auth required)
            data = await api.get('/public/pricing', {
              table: tableCode,
              ...(restaurantId ? { adminId: restaurantId } : {})
            });
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
