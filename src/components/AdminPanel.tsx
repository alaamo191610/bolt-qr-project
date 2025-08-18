// AdminSettings.tsx (replaces AdminPanel)
import React, { useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
// import { adminService } from '../services/adminService'; // <-- wire to your API if available

type AdminSettings = {
  restaurant_name: string;
  phone: string;
  address: string;
  description: string;
};

const DEFAULTS: AdminSettings = {
  restaurant_name: 'Bella Vista Restaurant',
  phone: '+1 (555) 123-4567',
  address: '123 Main Street, City, State 12345',
  description:
    'Fine dining experience with fresh, locally sourced ingredients and exceptional service.',
};

const AdminSettingsOnly: React.FC = () => {
  const { t, isRTL } = useLanguage();
  const [form, setForm] = useState<AdminSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(DEFAULTS);
  }, [form]);

  const onChange =
    <K extends keyof AdminSettings>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    };

  const onSave = async () => {
    try {
      setSaving(true);
      // await adminService.updateProfile(form); // <-- call your real API
      // If successful and you want to reset dirty baseline:
      // Object.assign(DEFAULTS, form);
      // toast.success(t('admin.saved')); // optional
    } catch (e) {
      console.error(e);
      // toast.error(t('admin.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`space-y-6 ${isRTL ? 'rtl' : ''}`}>
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-lg grid place-items-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {t('admin.title') || 'Restaurant Settings'}
            </h2>
            <p className="text-slate-600">
              {t('admin.subtitle') || 'Manage your restaurant information'}
            </p>
          </div>
        </div>

        {/* Settings Form */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-6">
            {t('admin.title') || 'Restaurant Information'}
          </h3>

          <form
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (!saving && dirty) onSave();
            }}
          >
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('admin.name') || 'Restaurant Name'}
              </label>
              <input
                type="text"
                value={form.restaurant_name}
                onChange={onChange('restaurant_name')}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('admin.phone') || 'Contact Phone'}
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={onChange('phone')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('admin.address') || 'Address'}
              </label>
              <input
                type="text"
                value={form.address}
                onChange={onChange('address')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('admin.description') || 'Description'}
              </label>
              <textarea
                rows={3}
                value={form.description}
                onChange={onChange('description')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setForm(DEFAULTS)}
                className="px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                disabled={!dirty || saving}
              >
                {t('common.reset') || 'Reset'}
              </button>
              <button
                type="submit"
                disabled={!dirty || saving}
                className={`px-6 py-2 text-white rounded-lg transition-colors ${
                  !dirty || saving
                    ? 'bg-emerald-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {saving
                  ? t('admin.saving') || 'Saving…'
                  : t('admin.save') || 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminSettingsOnly;
