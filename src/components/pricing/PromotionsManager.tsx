'use client';
import { useEffect, useState } from 'react';
import type { Promotion } from '../../pricing/types';
import { adminService } from '../../services/adminService';
import { useLanguage } from '../../contexts/LanguageContext';

const EMPTY: Promotion = {
  admin_id: '',
  code: '',
  type: 'percent',
  value: 10,
  min_order: 0,
  start_at: null,
  end_at: null,
  usage_limit: null,
  active: true,
  applies_to: 'global',
  table_id: null,
};

export default function PromotionsManager({ adminId }:{ adminId: string }){
  const { t, isRTL } = useLanguage();

  const [items, setItems] = useState<Promotion[]>([]);
  const [form, setForm] = useState<Promotion>({ ...EMPTY, admin_id: adminId });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async()=>{
    setLoading(true);
    try {
      const list = await adminService.listPromotions(adminId);
      setItems(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{ load(); },[adminId]);

  const onChange = (patch: Partial<Promotion>) => setForm(p=>({ ...p, ...patch }));

  const save = async()=>{
    setSaving(true);
    try{
      const payload = { ...form, admin_id: adminId, code: form.code.trim().toUpperCase() };
      await adminService.upsertPromotion(payload);
      setForm({ ...EMPTY, admin_id: adminId });
      await load();
    }catch(e:any){
      alert(`${t('common.error') || 'Error'}: ${e?.message || ''}`);
    } finally { setSaving(false); }
  };

  const toggle = async (row: Promotion) => {
    try{
      await adminService.setPromotionActive(adminId, row.id!, !row.active);
      await load();
    }catch(e:any){
      alert(`${t('common.error') || 'Error'}: ${e?.message || ''}`);
    }
  };

  const percentMode = form.type === 'percent';

  if (loading) {
    return <div className="p-6 rounded-xl border bg-white">{t('promos.loading') || 'Loading promotions…'}</div>;
  }

  return (
    <section className="bg-white rounded-xl border shadow-sm p-6 space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {t('promos.title') || 'Promotions'}
          </h3>
          <p className="text-slate-600 text-sm">
            {t('promos.description') || 'Create discount codes (% or fixed). Amounts use your base currency.'}
          </p>
        </div>
      </header>

      {/* New / Edit */}
      <div className="grid md:grid-cols-6 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="block text-sm text-slate-600 mb-1">{t('promos.code') || 'Code'}</label>
          <input
            className="w-full border rounded-md px-2 py-1 uppercase"
            value={form.code}
            onChange={e=>onChange({ code: e.target.value })}
            placeholder="WELCOME10"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">{t('promos.type') || 'Type'}</label>
          <select
            className="w-full border rounded-md px-2 py-1"
            value={form.type}
            onChange={e=>onChange({ type: e.target.value as any })}
          >
            <option value="percent">{t('promos.percent') || 'percent %'}</option>
            <option value="fixed">{t('promos.fixed') || 'fixed amount'}</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">
            {percentMode ? (t('promos.percentLabel') || 'Percent %') : (t('promos.amountBaseLabel') || 'Amount (base)')}
          </label>
          <input
            type="number"
            min={0}
            step={percentMode? 1: 0.1}
            className="w-full border rounded-md px-2 py-1"
            value={form.value}
            onChange={e=>onChange({ value: Number(e.target.value||0) })}
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">{t('promos.minOrderBase') || 'Min order (base)'}</label>
          <input
            type="number"
            min={0}
            step={0.1}
            className="w-full border rounded-md px-2 py-1"
            value={form.min_order ?? 0}
            onChange={e=>onChange({ min_order: Number(e.target.value||0) })}
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">{t('promos.usageLimit') || 'Usage limit'}</label>
          <input
            type="number"
            min={0}
            className="w-full border rounded-md px-2 py-1"
            value={form.usage_limit ?? 0}
            onChange={e=>onChange({ usage_limit: Number(e.target.value||0) })}
          />
        </div>

        <div className="md:col-span-6 grid md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('promos.start') || 'Start'}</label>
            <input
              type="datetime-local"
              className="w-full border rounded-md px-2 py-1"
              value={form.start_at ?? ''}
              onChange={e=>onChange({ start_at: e.target.value || null })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('promos.end') || 'End'}</label>
            <input
              type="datetime-local"
              className="w-full border rounded-md px-2 py-1"
              value={form.end_at ?? ''}
              onChange={e=>onChange({ end_at: e.target.value || null })}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('promos.scope') || 'Scope'}</label>
            <select
              className="w-full border rounded-md px-2 py-1"
              value={form.applies_to}
              onChange={e=>onChange({ applies_to: e.target.value as any })}
            >
              <option value="global">{t('promos.scopeGlobal') || 'global'}</option>
              <option value="table">{t('promos.scopeTable') || 'specific table'}</option>
            </select>
          </div>
          {form.applies_to==='table' && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">{t('promos.tableId') || 'Table ID'}</label>
              <input
                className="w-full border rounded-md px-2 py-1"
                value={form.table_id ?? ''}
                onChange={e=>onChange({ table_id: e.target.value })}
                placeholder="uuid"
              />
            </div>
          )}
        </div>

        <div className="md:col-span-6 flex justify-end">
          <button
            onClick={save}
            disabled={saving || !form.code}
            className={`px-4 py-2 rounded-lg text-sm font-medium border shadow-sm ${
              !form.code ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-emerald-600 text-white border-emerald-700'
            }`}
          >
            {saving ? (t('common.saving') || 'Saving…') : (t('promos.savePromo') || 'Save promo')}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="border rounded-xl overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="p-2 text-left">{t('promos.table.code') || 'Code'}</th>
              <th className="p-2">{t('promos.table.type') || 'Type'}</th>
              <th className="p-2">{t('promos.table.value') || 'Value'}</th>
              <th className="p-2">{t('promos.table.minOrder') || 'Min Order'}</th>
              <th className="p-2">{t('promos.table.start') || 'Start'}</th>
              <th className="p-2">{t('promos.table.end') || 'End'}</th>
              <th className="p-2">{t('promos.table.uses') || 'Uses'}</th>
              <th className="p-2">{t('promos.table.active') || 'Active'}</th>
              <th className="p-2">{t('promos.table.actions') || 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {items.map(row=> (
              <tr key={row.id} className="border-t">
                <td className="p-2 font-mono">{row.code}</td>
                <td className="p-2 text-center">{row.type}</td>
                <td className="p-2 text-center">{row.value}</td>
                <td className="p-2 text-center">{row.min_order ?? '-'}</td>
                <td className="p-2 text-center">{row.start_at ? new Date(row.start_at).toLocaleString() : '-'}</td>
                <td className="p-2 text-center">{row.end_at ? new Date(row.end_at).toLocaleString() : '-'}</td>
                <td className="p-2 text-center">{row.times_used ?? 0}</td>
                <td className="p-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${
                    row.active
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}>
                    {row.active ? (t('promos.table.badgeOn') || 'active') : (t('promos.table.badgeOff') || 'off')}
                  </span>
                </td>
                <td className="p-2 text-right">
                  <button className="px-3 py-1 rounded-md border" onClick={()=>toggle(row)}>
                    {row.active ? (t('promos.table.disable') || 'Disable') : (t('promos.table.enable') || 'Enable')}
                  </button>
                </td>
              </tr>
            ))}
            {items.length===0 && (
              <tr>
                <td className="p-3 text-center text-slate-500" colSpan={9}>
                  {t('promos.table.empty') || 'No promotions yet'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}