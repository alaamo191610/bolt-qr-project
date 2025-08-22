'use client';
import { useEffect, useMemo, useState } from 'react';
import { CURRENCIES, DEFAULT_PRICING, type PricingPrefs, type CurrencyCode } from '../../pricing/types';
import { roundAmount, formatCurrency } from '../../pricing/money';
import { adminService } from '../../services/adminService';
import { useLanguage } from '../../contexts/LanguageContext';

export default function CurrencySettings({ adminId }:{ adminId: string }){
  const { t, isRTL } = useLanguage();

  const [prefs, setPrefs] = useState<PricingPrefs>(DEFAULT_PRICING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(()=>{
    let mounted = true;
    (async ()=>{
      setLoading(true);
      try{
        const settings = await adminService.getAdminMonetarySettings(adminId);
        const incoming = settings?.pricing_prefs;
        setPrefs(incoming && Object.keys(incoming).length ? incoming : DEFAULT_PRICING);
        setDirty(false);
      }catch(e){ console.error(e); setPrefs(DEFAULT_PRICING);} finally{ if(mounted) setLoading(false); }
    })();
    return ()=>{ mounted=false };
  },[adminId]);

  const onBaseChange = (code: CurrencyCode) => {
    setPrefs(p=>({ ...p, baseCurrency: code, exchangeRates: { ...p.exchangeRates, [code]: 1 } }));
    setDirty(true);
  };

  const toggleEnabled = (code: CurrencyCode) => {
    setPrefs(p=>{
      const on = new Set(p.enabledCurrencies);
      on.has(code) ? on.delete(code) : on.add(code);
      return { ...p, enabledCurrencies: Array.from(on) as CurrencyCode[] };
    });
    setDirty(true);
  };

  const setRate = (code: CurrencyCode, v: number) => {
    setPrefs(p=>({ ...p, exchangeRates: { ...p.exchangeRates, [code]: Math.max(0, v) } }));
    setDirty(true);
  };

  const save = async()=>{
    setSaving(true);
    try{
      await adminService.savePricingPrefs(adminId, prefs);
      setDirty(false);
    }catch(e:any){
      alert((t('common.error') || 'Error') + ': ' + (e?.message || ''));
    }finally{ setSaving(false); }
  };

  // helper to localize currency names (falls back to english name)
  const currencyName = (code: CurrencyCode) =>
    t(`pricing.currencies.${code}`) || (CURRENCIES.find(c=>c.code===code)?.name ?? code);

  const preview = useMemo(()=>{
    const base = 100; // sample price
    const cur = CURRENCIES.find(c=>c.code===prefs.baseCurrency)!;
    const list = CURRENCIES
      .filter(c=>prefs.enabledCurrencies.includes(c.code))
      .map(c=>{
        const rate = c.code===prefs.baseCurrency ? 1 : (prefs.exchangeRates[c.code]||0);
        const raw = base * rate;
        const rounded = roundAmount(raw, prefs.rounding);
        return { code: c.code, label: currencyName(c.code as CurrencyCode), value: formatCurrency(rounded, c.code as CurrencyCode, c.symbol, prefs.priceDisplay) };
      });
    return { base: formatCurrency(base, cur.code as CurrencyCode, cur.symbol, prefs.priceDisplay), list };
  },[prefs]);

  if (loading) {
    return <div className="p-6 rounded-xl border bg-white">{t('pricing.loading') || 'Loading…'}</div>;
  }

  // Interpolations for text that includes the base currency
  const ratesHint = (t('pricing.ratesHint') || `1 {base} = X target currency`).replace('{base}', prefs.baseCurrency);
  const previewTitle = (t('pricing.previewTitle') || `Preview (100 {base})`).replace('{base}', prefs.baseCurrency);

  return (
    <section className="bg-white rounded-xl border shadow-sm p-6 space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{t('pricing.title') || 'Pricing & Currency'}</h3>
          <p className="text-slate-600 text-sm">{t('pricing.description') || 'Base currency, enabled currencies, exchange rates & rounding.'}</p>
        </div>
      </header>

      {/* Base currency */}
      <div className="space-y-2">
        <h4 className="font-medium text-slate-800">{t('pricing.baseCurrency') || 'Base currency'}</h4>
        <div className="flex flex-wrap gap-3">
          {CURRENCIES.map(c=> (
            <label key={c.code} className="inline-flex items-center gap-2 border rounded-lg px-3 py-2">
              <input type="radio" name="baseCurrency" checked={prefs.baseCurrency===c.code} onChange={()=>onBaseChange(c.code as CurrencyCode)} />
              <span className="text-sm">{currencyName(c.code as CurrencyCode)} ({c.code})</span>
            </label>
          ))}
        </div>
      </div>

      {/* Enabled + rates */}
      <div className="space-y-2">
        <h4 className="font-medium text-slate-800">{t('pricing.enabledRatesTitle') || 'Enabled currencies & rates'}</h4>
        <p className="text-slate-500 text-sm">{ratesHint}</p>
        <div className="grid md:grid-cols-2 gap-3">
          {CURRENCIES.map(c=> (
            <div key={c.code} className="flex items-center justify-between border rounded-lg p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={prefs.enabledCurrencies.includes(c.code as CurrencyCode)}
                  onChange={()=>toggleEnabled(c.code as CurrencyCode)}
                />
                {currencyName(c.code as CurrencyCode)} ({c.code})
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{t('pricing.rate') || 'rate'}</span>
                <input
                  type="number"
                  step={0.0001}
                  className="w-28 border rounded-md px-2 py-1 text-right"
                  value={prefs.exchangeRates[c.code as CurrencyCode] ?? 0}
                  onChange={e=>setRate(c.code as CurrencyCode, Number(e.target.value||0))}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Display & rounding */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium text-slate-800">{t('pricing.priceDisplay') || 'Price display'}</h4>
          <div className="flex gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="priceDisplay"
                checked={prefs.priceDisplay==='symbol'}
                onChange={()=>{setPrefs(p=>({...p, priceDisplay:'symbol'})); setDirty(true);}}
              />
              {t('pricing.priceDisplaySymbol') || 'Symbol'}
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="priceDisplay"
                checked={prefs.priceDisplay==='code'}
                onChange={()=>{setPrefs(p=>({...p, priceDisplay:'code'})); setDirty(true);}}
              />
              {t('pricing.priceDisplayCode') || 'Code'}
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-slate-800">{t('pricing.rounding') || 'Rounding'}</h4>
          <select
            className="border rounded-md px-2 py-1"
            value={prefs.rounding}
            onChange={e=>{setPrefs(p=>({...p, rounding: e.target.value as any})); setDirty(true);}}
          >
            <option value="none">{t('pricing.roundingNone') || 'none'}</option>
            <option value="nearest-0.05">{t('pricing.rounding005') || 'nearest 0.05'}</option>
            <option value="nearest-0.1">{t('pricing.rounding01') || 'nearest 0.1'}</option>
            <option value="nearest-0.5">{t('pricing.rounding05') || 'nearest 0.5'}</option>
          </select>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-slate-800">{t('pricing.taxMode') || 'Tax mode'}</h4>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs.taxInclusive}
              onChange={e=>{setPrefs(p=>({...p, taxInclusive: e.target.checked})); setDirty(true);}}
            />
            {t('pricing.taxInclusive') || 'Item prices include VAT'}
          </label>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <h4 className="font-medium text-slate-800">{previewTitle}</h4>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          {preview.list.map(row=> (
            <div key={row.code} className="border rounded-lg p-3">
              <div className="text-slate-500 text-xs">{row.code}</div>
              <div className="font-medium">{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      <footer className="pt-2">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className={`px-4 py-2 rounded-lg text-sm font-medium border shadow-sm ${dirty ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
        >
          {saving ? (t('common.saving') || 'Saving…') : dirty ? (t('pricing.saveChanges') || 'Save changes') : (t('pricing.saved') || 'Saved')}
        </button>
      </footer>
    </section>
  );
}