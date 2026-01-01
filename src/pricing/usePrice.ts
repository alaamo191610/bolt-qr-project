// src/pricing/usePrice.ts
import { CURRENCIES } from './types';
import { roundAmount, formatCurrency } from './money';
import type { PricingPrefs, CurrencyCode } from './types';

export function formatPrice(baseAmount: number, prefs: PricingPrefs, as?: CurrencyCode) {
  const target: CurrencyCode = as && prefs.enabledCurrencies.includes(as) ? as : prefs.baseCurrency;
  const currency = CURRENCIES.find(c => c.code === target) || CURRENCIES[0];
  const rate = target === prefs.baseCurrency ? 1 : (prefs.exchangeRates[target] || 0);
  const rounded = roundAmount(baseAmount * rate, prefs.rounding);
  return formatCurrency(rounded, target, currency.symbol, prefs.priceDisplay);
}
