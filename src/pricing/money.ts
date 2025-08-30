import type { RoundingRule, CurrencyCode } from './types';


export function roundAmount(v: number, rule: RoundingRule): number {
switch (rule) {
case 'none': return v;
case 'nearest-0.05': return Math.round(v / 0.05) * 0.05;
case 'nearest-0.1': return Math.round(v / 0.1) * 0.1;
case 'nearest-0.5': return Math.round(v / 0.5) * 0.5;
default: return v;
}
}


export function formatCurrency(amount: number, code: CurrencyCode, symbol: string, mode: 'symbol'|'code') {
const n = amount.toFixed(2);
return mode === 'symbol' ? `${symbol}${n}` : `${n} ${code}`;
}