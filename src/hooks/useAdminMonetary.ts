// src/hooks/useAdminMonetary.ts
import { useEffect, useState } from 'react';
import { adminService } from '../services/adminService';
import { DEFAULT_PRICING, DEFAULT_BILLING, type PricingPrefs, type BillingSettings } from '../pricing/types';

const CACHE_KEY = 'monetary:v1';

type CacheShape = {
  prefs: PricingPrefs;
  billing: BillingSettings;
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
  // if we have cache, we can render without loading flicker
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await adminService.getAdminMonetarySettings(adminId);
        if (!alive) return;
        const newPrefs = data?.pricing_prefs ?? DEFAULT_PRICING;
        const newBilling = data?.billing_settings ?? DEFAULT_BILLING;
        setPrefs(newPrefs);
        setBilling(newBilling);
        // 2) write-through cache
        localStorage.setItem(CACHE_KEY, JSON.stringify({ prefs: newPrefs, billing: newBilling, ts: Date.now() }));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [adminId]);

  return { prefs, billing, loading };
}