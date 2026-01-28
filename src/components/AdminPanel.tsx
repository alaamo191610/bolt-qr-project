import React, { useMemo, useState, Suspense, useEffect } from "react";
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
import LogoUpload from "../components/ui/LogoUpload"; // [NEW] Import LogoUpload
import { adminService } from "../services/adminService"; // [NEW] Import adminService
import { toast } from "react-hot-toast"; // [NEW] Import toast

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
  logo_url?: string | null; // [NEW] Add logo_url
};

const DEFAULTS: AdminSettings = {
  restaurant_name: "Bella Vista Restaurant",
  phone: "+1 (555) 123-4567",
  address: "123 Main Street, City, State 12345",
  description:
    "Fine dining experience with fresh, locally sourced ingredients and exceptional service.",
  logo_url: null,
};

type Props = { adminId: string };

const AdminSettingsOnly: React.FC<Props> = ({ adminId }) => {
  const { t, isRTL } = useLanguage();
  const [form, setForm] = useState<AdminSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true); // [NEW] Loading state
  const [saving, setSaving] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(DEFAULTS),
    [form]
  );

  // [NEW] Fetch data on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const profile = await adminService.getAdminProfile(adminId);
        // Map backend profile to form state
        if (profile) {
          setForm({
            restaurant_name: profile.restaurant_name || DEFAULTS.restaurant_name,
            phone: profile.phone || DEFAULTS.phone,
            address: profile.address || DEFAULTS.address,
            description: profile.description || DEFAULTS.description,
            logo_url: profile.logo_url || null,
          });
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
        toast.error("Failed to load restaurant profile");
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [adminId]);

  const onChange =
    <K extends keyof AdminSettings>(key: K) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const onSave = async () => {
    try {
      setSaving(true);
      await adminService.updateAdminProfile(adminId, form);

      // [NEW] Update local cache to reflect changes globally
      const CACHE_KEY = 'monetary:v1';
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        const cache = raw ? JSON.parse(raw) : {};
        const newCache = {
          ...cache,
          restaurantName: form.restaurant_name,
          logoUrl: form.logo_url,
          ts: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));
        // Dispatch a storage event to potentially update other tabs or listeners
        window.dispatchEvent(new Event('storage'));
      } catch (e) {
        console.error("Failed to update local cache", e);
      }

      toast.success(t("admin.saved") || "Settings saved successfully");
    } catch (error) {
      console.error("Failed to save profile:", error);
      toast.error(t("admin.saveFailed") || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading settings...</div>;
  }

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
          {/* [NEW] Logo Upload Section */}
          <div className="mb-8 border-b border-slate-100 pb-8">
            <LogoUpload
              currentLogo={form.logo_url}
              onLogoChange={(base64) => setForm(prev => ({ ...prev, logo_url: base64 || undefined }))}
              restaurantName={form.restaurant_name}
            />
          </div>

          <form
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (!saving && isDirty) onSave();
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
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              type="button"
              onClick={() => setForm(DEFAULTS)}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
              disabled={!isDirty || saving}
            >
              {t("common.reset") || "Reset"}
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={!isDirty || saving}
              className={`px-4 py-2 text-white rounded-lg ${!isDirty || saving
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
