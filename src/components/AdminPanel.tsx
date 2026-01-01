import React, { useMemo, useState, Suspense } from "react";
import { Settings } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import CurrencySettings from "../components/pricing/CurrencySettings";
import FeesTaxSettings from "../components/pricing/FeesTaxSettings";
import PromotionsManager from "../components/pricing/PromotionsManager";
import ThemeCustomizer from "../components/ThemeCustomizer";
import { Palette } from "lucide-react";
// ⬅️ your PanelCard component (adjust import path if different)
import PanelCard from "../components/ui/PanelCard";
import CollapsiblePanelCard from "../components/ui/CollapsiblePanelCard";

import { Tabs, TabList, Tab, TabPanels, TabPanel } from "../components/ui/Tabs";
// ⬅️ lazy-load client components (avoid SSR issues)
const OrderWorkflowRules = React.lazy(
  () => import("../components/orders/OrderWorkflowRules")
);
const KDSSettings = React.lazy(
  () => import("../components/orders/KDSSettings")
);

type AdminSettings = {
  restaurant_name: string;
  phone: string;
  address: string;
  description: string;
};

const DEFAULTS: AdminSettings = {
  restaurant_name: "Bella Vista Restaurant",
  phone: "+1 (555) 123-4567",
  address: "123 Main Street, City, State 12345",
  description:
    "Fine dining experience with fresh, locally sourced ingredients and exceptional service.",
};

type Props = { adminId: string };

const AdminSettingsOnly: React.FC<Props> = ({ adminId }) => {
  const { t, isRTL } = useLanguage();
  const [form, setForm] = useState<AdminSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(DEFAULTS),
    [form]
  );

  const onChange =
    <K extends keyof AdminSettings>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const onSave = async () => {
    try {
      setSaving(true);
      // await adminService.updateAdminProfile(adminId, form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`space-y-6 ${isRTL ? "rtl" : ""}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-lg grid place-items-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {t("admin.title") || "Restaurant Settings"}
            </h2>
            <p className="text-slate-600">
              {t("admin.subtitle") || "Manage your restaurant information"}
            </p>
          </div>
        </div>

        {/* Restaurant Info Form */}
        <CollapsiblePanelCard
          title={t("admin.infoTitle") || "Restaurant Information"}
          // description={t('admin.subtitle') || 'Public details shown to guests'}
          actions={
            <div className="flex flex-wrap gap-3">
              {/* NEW: open theme sheet from inside this card */}
              <button
                type="button"
                onClick={() => setThemeOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
              >
                <Palette className="w-4 h-4" />
                {t("theme.themeCustomize") || "Customize Theme"}
              </button>
            </div>
          }
        >
          <form
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (!saving && dirty) onSave();
            }}
          >
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t("admin.name") || "Restaurant Name"}
              </label>
              <input
                type="text"
                value={form.restaurant_name}
                onChange={onChange("restaurant_name")}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t("admin.phone") || "Contact Phone"}
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={onChange("phone")}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t("admin.address") || "Address"}
              </label>
              <input
                type="text"
                value={form.address}
                onChange={onChange("address")}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t("admin.description") || "Description"}
              </label>
              <textarea
                rows={3}
                value={form.description}
                onChange={onChange("description")}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </form>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setForm(DEFAULTS)}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
              disabled={!dirty || saving}
            >
              {t("common.reset") || "Reset"}
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={!dirty || saving}
              className={`px-4 py-2 text-white rounded-lg ${
                !dirty || saving
                  ? "bg-emerald-400 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {saving
                ? t("admin.saving") || "Saving…"
                : t("common.save") || "Save Settings"}
            </button>
          </div>
        </CollapsiblePanelCard>
        <ThemeCustomizer
          open={themeOpen}
          onOpenChange={setThemeOpen}
          title={t("theme.title") || "Theme Customizer"}
          subtitle={t("theme.description") || "Elegant palettes & refined UI"}
        />
        {/* Tabs for Menu/KDS */}
        <div className="mt-6">
          <Tabs
            defaultValue="workflow"
            storageKey="admin-settings-tab"
            queryKey="tab"
            rtl={isRTL}
          >
            <TabList>
              <Tab value="workflow">
                {t("admin.orderWorkflow") || "Order Workflow"}
              </Tab>
              <Tab value="pricing">
                {t("admin.tabs.pricing") || "Pricing & Currency"}
              </Tab>
              <Tab value="promos">
                {t("admin.tabs.promotions") || "Promotions"}
              </Tab>
              <Tab value="kds">{t("admin.kdsSettings") || "KDS Settings"}</Tab>
            </TabList>

            <TabPanels>
              <TabPanel value="workflow">
                <PanelCard
                  title={t("admin.orderWorkflow") || "Order Workflow Rules"}
                  description={
                    t("admin.orderWorkflowDesc") ||
                    "Statuses, transitions, and SLAs enforced across the app"
                  }
                >
                  <Suspense fallback={<div>Loading...</div>}>
                    <OrderWorkflowRules adminId={adminId} />
                  </Suspense>
                </PanelCard>
              </TabPanel>
              <TabPanel value="pricing">
                <div className="space-y-6">
                  <CurrencySettings adminId={adminId} />
                  <FeesTaxSettings adminId={adminId} />
                </div>
              </TabPanel>

              <TabPanel value="promos">
                <PromotionsManager adminId={adminId} />
              </TabPanel>

              <TabPanel value="kds">
                <PanelCard
                  title={t("admin.kdsSettings") || "Kitchen Display Settings"}
                  description={
                    t("admin.kdsSettingsDesc") ||
                    "Columns, sounds, auto-bump, and visual preferences for KDS"
                  }
                >
                  <Suspense fallback={<div>Loading...</div>}>
                    <KDSSettings adminId={adminId} />
                  </Suspense>
                </PanelCard>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default AdminSettingsOnly;
