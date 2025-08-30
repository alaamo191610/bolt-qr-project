export type CurrencyCode = 'USD' | 'QAR' | 'JOD' | 'SAR';


export type RoundingRule = 'none' | 'nearest-0.05' | 'nearest-0.1' | 'nearest-0.5';


export type PriceDisplay = 'symbol' | 'code';


export type PricingPrefs = {
baseCurrency: CurrencyCode; // pricing source of truth
enabledCurrencies: CurrencyCode[]; // which currencies guests can see
exchangeRates: Record<CurrencyCode, number>; // 1 baseCurrency = X targetCurrency
priceDisplay: PriceDisplay; // how you show prices next to amounts
rounding: RoundingRule; // UI rounding for shown prices (not storage)
taxInclusive: boolean; // are item prices tax-inclusive?
};


export type BillingSettings = {
vatPercent: number; // e.g., 0, 5, 14
serviceChargePercent: number; // e.g., 0, 10
deliveryFee: number; // flat fee in BASE currency
showVatLine: boolean;
showServiceChargeLine: boolean;
};


export type PromotionType = 'percent' | 'fixed';


export type Promotion = {
id?: string;
admin_id: string;
code: string; // e.g., WELCOME10
type: PromotionType; // 'percent' or 'fixed'
value: number; // percent (0-100) or fixed amount (BASE currency)
min_order?: number | null; // in BASE currency
start_at?: string | null; // ISO string
end_at?: string | null; // ISO string
usage_limit?: number | null; // max total uses
times_used?: number; // incremented by backend
active: boolean;
applies_to?: 'global' | 'table';
table_id?: string | null;
created_at?: string;
};


export const DEFAULT_PRICING: PricingPrefs = {
baseCurrency: 'QAR',
enabledCurrencies: ['QAR', 'USD', 'JOD', 'SAR'],
exchangeRates: { QAR: 1, USD: 0, JOD: 0, SAR: 0 }, // fill manually or via service
priceDisplay: 'symbol',
rounding: 'none',
taxInclusive: true,
};


export const DEFAULT_BILLING: BillingSettings = {
vatPercent: 0,
serviceChargePercent: 0,
deliveryFee: 0,
showVatLine: true,
showServiceChargeLine: true,
};


export const CURRENCIES: Array<{ code: CurrencyCode; name: string; symbol: string }> = [
{ code: 'USD', name: 'US Dollar', symbol: '$' },
{ code: 'QAR', name: 'Qatari Riyal', symbol: 'ر.ق' },
{ code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.أ' }, // JD
{ code: 'SAR', name: 'Saudi Riyal', symbol: 'ر.س' },
];