// src/pricing/totals.ts
import type { BillingSettings, Promotion } from './types';

export function computePromoDiscount(subtotal: number, promo?: Promotion | null) {
  if (!promo || !promo.active) return 0;
  const now = new Date();
  if (promo.start_at && new Date(promo.start_at) > now) return 0;
  if (promo.end_at && new Date(promo.end_at) < now) return 0;
  if (promo.min_order && subtotal < promo.min_order) return 0;
  if (promo.type === 'percent') return +(subtotal * (promo.value / 100)).toFixed(2);
  return +Math.min(subtotal, promo.value).toFixed(2);
}

export function computeTotals(subtotal: number, billing: BillingSettings, promo?: Promotion | null) {
  const discount = computePromoDiscount(subtotal, promo);
  const afterPromo = Math.max(0, subtotal - discount);
  const vat = billing.showVatLine ? +(afterPromo * (billing.vatPercent / 100)).toFixed(2) : 0;
  const service = billing.showServiceChargeLine ? +(afterPromo * (billing.serviceChargePercent / 100)).toFixed(2) : 0;
  const total = +(afterPromo + vat + service + billing.deliveryFee).toFixed(2);
  return { discount, vat, service, total };
}
