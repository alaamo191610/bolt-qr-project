'use client';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_BILLING, type BillingSettings } from '../../pricing/types';
import { adminService } from '../../services/adminService';
import { useLanguage } from '../../contexts/LanguageContext';

export default function FeesTaxSettings({ adminId }:{ adminId: string }){
  const { t, isRTL } = useLanguage();

  const [settings, setSettings] = useState<BillingSettings>(DEFAULT_BILLING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(()=>{
    let mounted = true;
    (async ()=>{
      setLoading(true);
      try{
        const data = await adminService.getAdminMonetarySettings(adminId);
        const incoming = data?.billing_settings;
        setSettings(incoming && Object.keys(incoming).length ? incoming : DEFAULT_BILLING);
        setDirty(false);
      }catch(e){
        console.error(e);
        setSettings(DEFAULT_BILLING);
      } finally { if(mounted) setLoading(false); }
    })();
    return ()=>{ mounted=false };
  },[adminId]);

  const save = async()=>{
    setSaving(true);
    try{
      await adminService.saveBillingSettings(adminId, settings);
      setDirty(false);
    }catch(e:any){
      alert(`${t('common.error') || 'Error'}: ${e?.message || ''}`);
    }finally{
      setSaving(false);
    }
  };

  const update = (patch: Partial<BillingSettings>) => {
    setSettings(p=>({ ...p, ...patch }));
    setDirty(true);
  };

  const preview = useMemo(()=>{
    const subtotal = 100;
    const vat = (settings.vatPercent/100) * subtotal;
    const service = (settings.serviceChargePercent/100) * subtotal;
    const total = subtotal
      + (settings.showVatLine ? vat : 0)
      + (settings.showServiceChargeLine ? service : 0)
      + settings.deliveryFee;
    return {
      subtotal,
      vat: +vat.toFixed(2),
      service: +service.toFixed(2),
      total: +total.toFixed(2)
    };
  },[settings]);

  if (loading) {
    return <div className="p-6 rounded-xl border bg-white">{t('fees.loading') || 'Loading…'}</div>;
  }

  return (
    <section className="bg-white rounded-xl border shadow-sm p-6 space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {t('fees.title') || 'Fees, VAT & Service'}
          </h3>
          <p className="text-slate-600 text-sm">
            {t('fees.description') || 'Define VAT %, service charge %, and delivery fee (in base currency).'}
          </p>
        </div>
      </header>

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-slate-600 mb-1">
            {t('fees.vatPercent') || 'VAT %'}
          </label>
          <input
            type="number"
            min={0}
            step={0.1}
            className="w-full border rounded-md px-2 py-1"
            value={settings.vatPercent}
            onChange={e=>update({ vatPercent: Math.max(0, Number(e.target.value || 0)) })}
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">
            {t('fees.serviceChargePercent') || 'Service charge %'}
          </label>
          <input
            type="number"
            min={0}
            step={0.1}
            className="w-full border rounded-md px-2 py-1"
            value={settings.serviceChargePercent}
            onChange={e=>update({ serviceChargePercent: Math.max(0, Number(e.target.value || 0)) })}
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">
            {t('fees.deliveryFeeBase') || 'Delivery fee (base currency)'}
          </label>
          <input
            type="number"
            min={0}
            step={0.1}
            className="w-full border rounded-md px-2 py-1"
            value={settings.deliveryFee}
            onChange={e=>update({ deliveryFee: Math.max(0, Number(e.target.value || 0)) })}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.showVatLine}
            onChange={e=>update({ showVatLine: e.target.checked })}
          />
          {t('fees.showVatLine') || 'Show VAT line on receipt'}
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.showServiceChargeLine}
            onChange={e=>update({ showServiceChargeLine: e.target.checked })}
          />
          {t('fees.showServiceChargeLine') || 'Show Service Charge line'}
        </label>
      </div>

      <div>
        <h4 className="font-medium text-slate-800 mb-2">
          {t('fees.previewTitle') || 'Preview (Subtotal = 100)'}
        </h4>
        <div className="border rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span>{t('fees.subtotal') || 'Subtotal'}</span>
            <span>{preview.subtotal.toFixed(2)}</span>
          </div>
          {settings.showVatLine && (
            <div className="flex justify-between">
              <span>{t('fees.vat') || 'VAT'}</span>
              <span>{preview.vat.toFixed(2)}</span>
            </div>
          )}
          {settings.showServiceChargeLine && (
            <div className="flex justify-between">
              <span>{t('fees.serviceCharge') || 'Service Charge'}</span>
              <span>{preview.service.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>{t('fees.deliveryFee') || 'Delivery Fee'}</span>
            <span>{settings.deliveryFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>{t('fees.total') || 'Total'}</span>
            <span>{preview.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <footer className="pt-2">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className={`px-4 py-2 rounded-lg text-sm font-medium border shadow-sm ${
            dirty ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}
        >
          {saving
            ? (t('common.saving') || 'Saving…')
            : dirty
              ? (t('fees.saveChanges') || 'Save changes')
              : (t('fees.saved') || 'Saved')}
        </button>
      </footer>
    </section>
  );
}