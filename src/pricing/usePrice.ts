// src/pricing/usePrice.ts
import { CURRENCIES } from './types';
import { roundAmount, formatCurrency } from './money';
import type { PricingPrefs, CurrencyCode } from './types';

export function formatPrice(baseAmount: number, prefs: PricingPrefs | null | undefined, as?: CurrencyCode) {
  // Fallback to the system default JOD if preferences are not loaded.
  if (!prefs || !prefs.baseCurrency) {
    const jod = CURRENCIES.find(c => c.code === 'JOD') || CURRENCIES[0];
    return formatCurrency(baseAmount, 'JOD', jod.symbol, 'symbol');
  }

  const target: CurrencyCode = as && prefs.enabledCurrencies.includes(as) ? as : prefs.baseCurrency;
  const currency = CURRENCIES.find(c => c.code === target) || CURRENCIES[0];
  const rate = target === prefs.baseCurrency ? 1 : (prefs.exchangeRates[target] || 0);
  const rounded = roundAmount(baseAmount * rate, prefs.rounding);
  return formatCurrency(rounded, target, currency.symbol, prefs.priceDisplay);
}
