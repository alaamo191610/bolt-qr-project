// src/pricing/totals.ts
import type { BillingSettings, Promotion, RoundingRule } from './types';
import { roundAmount } from './money';

const to2dp = (v: number) => +v.toFixed(2);

export function computePromoDiscount(subtotal: number, promo?: Promotion | null) {
  if (!promo || !promo.active) return 0;
  const now = new Date();
  if (promo.start_at && new Date(promo.start_at) > now) return 0;
  if (promo.end_at && new Date(promo.end_at) < now) return 0;
  if (promo.min_order && subtotal < promo.min_order) return 0;
  if (promo.type === 'percent') return +(subtotal * (promo.value / 100)).toFixed(2);
  return +Math.min(subtotal, promo.value).toFixed(2);
}

export function computeTotals(
  subtotal: number,
  billing: BillingSettings,
  promo?: Promotion | null,
  options?: { taxInclusive?: boolean; includeDelivery?: boolean; rounding?: RoundingRule }
) {
  // Must mirror calculateOrderTotals() in server/index.js. The server is
  // authoritative; this only previews the same figures before submit, so both
  // sides apply the restaurant's rounding rule to each line and derive the
  // total from the rounded lines.
  const rule: RoundingRule = options?.rounding ?? 'none';
  const round = (v: number) => to2dp(roundAmount(v, rule));

  const discount = round(computePromoDiscount(subtotal, promo));
  const afterPromo = round(Math.max(0, subtotal - discount));
  const service = billing.showServiceChargeLine ? round(afterPromo * (billing.serviceChargePercent / 100)) : 0;
  const vatBase = afterPromo + service;
  const vat = billing.showVatLine
    ? options?.taxInclusive
      ? round(vatBase - vatBase / (1 + billing.vatPercent / 100))
      : round(vatBase * (billing.vatPercent / 100))
    : 0;
  const delivery = options?.includeDelivery ? round(billing.deliveryFee) : 0;
  const total = to2dp(afterPromo + service + delivery + (options?.taxInclusive ? 0 : vat));
  return { discount, vat, service, total };
}
