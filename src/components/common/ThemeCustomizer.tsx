// src/components/common/ThemeCustomizer.tsx
import React, { useMemo, useState, useEffect } from "react";
import { Palette, Sun, Moon, RotateCcw, Check, X, Copy, ChevronDown, Type } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { updateAdminTheme } from "../../services/adminService";

const normalizeHex = (v: string) => {
  let s = v.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s))
    s = s
      .split("")
      .map((ch) => ch + ch)
      .join("");
  if (/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return `#${s.toUpperCase()}`;
};

const textOn = (hex: string) => {
  const n = normalizeHex(hex);
  if (!n) return "#FFFFFF";
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "#0F172A" : "#FFFFFF";
};

type Colors = { primary: string; secondary: string; accent: string };

const classyPresets: Array<{
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  note?: string;
}> = [
    {
      name: "Charcoal & Gold",
      primary: "#1F2937",
      secondary: "#A78BFA",
      accent: "#D4AF37",
      note: "Understated luxury",
    },
    {
      name: "Navy & Sand",
      primary: "#1E3A8A",
      secondary: "#64748B",
      accent: "#F5C973",
      note: "Coastal, refined",
    },
    {
      name: "Forest & Clay",
      primary: "#065F46",
      secondary: "#8B5E34",
      accent: "#E0A96D",
      note: "Earthy, warm",
    },
    {
      name: "Plum & Champagne",
      primary: "#6D28D9",
      secondary: "#9D174D",
      accent: "#F3D9B1",
      note: "Boutique, modern",
    },
    {
      name: "Teal & Copper",
      primary: "#0F766E",
      secondary: "#7C3E2B",
      accent: "#D97706",
      note: "Bold, premium",
    },
    {
      name: "Indigo",
      primary: "#4F46E5",
      secondary: "#6366F1",
      accent: "#84CC16",
    },
  ];

const FONT_FAMILIES = [
  { name: "Inter", value: "Inter, system-ui, sans-serif", category: "sans-serif" },
  { name: "Poppins", value: "Poppins, sans-serif", category: "sans-serif" },
  { name: "Montserrat", value: "Montserrat, sans-serif", category: "sans-serif" },
  { name: "Work Sans", value: "'Work Sans', sans-serif", category: "sans-serif" },
  { name: "Playfair Display", value: "'Playfair Display', serif", category: "serif" },
  { name: "Merriweather", value: "Merriweather, serif", category: "serif" },
  { name: "Lora", value: "Lora, serif", category: "serif" },
  { name: "Crimson Text", value: "'Crimson Text', serif", category: "serif" },
  { name: "Bebas Neue", value: "'Bebas Neue', display", category: "display" },
  { name: "Righteous", value: "Righteous, display", category: "display" },
];

const PRESET_KEY = "theme-preset-name";
const sameHex = (a?: string | null, b?: string | null) =>
  !!a && !!b && normalizeHex(a) === normalizeHex(b);
const findPresetNameFor = (c: Colors): string | null => {
  const p = classyPresets.find(
    (x) =>
      sameHex(x.primary, c.primary) &&
      sameHex(x.secondary, c.secondary) &&
      sameHex(x.accent, c.accent)
  );
  return p?.name ?? null;
};

const Chip: React.FC<{ label: string; bg: string }> = ({ label, bg }) => (
  <span
    className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
    style={{ backgroundColor: bg, color: textOn(bg) }}
  >
    {label}
  </span>
);

type SheetProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title?: string;
  subtitle?: string;
};

const ThemeCustomizer: React.FC<SheetProps> = ({
  open,
  onOpenChange,
  title,
  subtitle,
}) => {
  const { colors, updateColors, fontFamily, updateFontFamily, isDark, toggleDarkMode, resetToDefault } =
    useTheme();
  const { t } = useLanguage();
  const [temp, setTemp] = useState<Colors>(colors);
  const [tempFont, setTempFont] = useState<string>(fontFamily);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(() =>
    localStorage.getItem(PRESET_KEY)
  );
  const [copied, setCopied] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState({
    colors: true,
    typography: true,
    preview: true,
  });

  // Fallbacks if props or keys missing
  const effectiveTitle = title || t('theme.themeCustomize') || "Theme Customizer";
  const effectiveSubtitle = subtitle || t('theme.description') || "Elegant palettes & refined UI";

  // Load Google Fonts dynamically
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&family=Work+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&family=Merriweather:wght@400;700&family=Lora:wght@400;500;600;700&family=Crimson+Text:wght@400;600;700&family=Bebas+Neue&family=Righteous&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Resync draft + preset when the sheet opens
  useEffect(() => {
    if (open) {
      const draft = {
        primary: colors.primary,
        secondary: colors.secondary,
        accent: colors.accent,
      };
      setTemp(draft);
      setTempFont(fontFamily);
      const exact = findPresetNameFor(draft);
      if (exact) {
        setSelectedPreset(exact);
        localStorage.setItem(PRESET_KEY, exact);
      } else {
        const saved = localStorage.getItem(PRESET_KEY);
        if (saved) {
          setSelectedPreset(null);
          localStorage.removeItem(PRESET_KEY);
        }
      }
    }
  }, [open, colors, fontFamily]);

  const handleChange = (key: keyof Colors, value: string) => {
    if (selectedPreset) {
      setSelectedPreset(null);
      localStorage.removeItem(PRESET_KEY);
    }
    setTemp((prev) => ({ ...prev, [key]: value }));
  };

  const handleBlur = (key: keyof Colors) => {
    const fixed = normalizeHex(temp[key]);
    if (fixed) setTemp((prev) => ({ ...prev, [key]: fixed }));
  };

  const applyPreset = (p: (typeof classyPresets)[number]) => {
    setTemp({ primary: p.primary, secondary: p.secondary, accent: p.accent });
    setSelectedPreset(p.name);
    localStorage.setItem(PRESET_KEY, p.name);
  };

  const applyChanges = async () => {
    const fixed: Colors = {
      primary: normalizeHex(temp.primary) ?? colors.primary,
      secondary: normalizeHex(temp.secondary) ?? colors.secondary,
      accent: normalizeHex(temp.accent) ?? colors.accent,
    };
    updateColors(fixed);
    updateFontFamily(tempFont);
    try {
      await updateAdminTheme({ theme: fixed, font_family: tempFont });
    } catch (e) {
      console.error("Failed to save theme", e);
    }
    const exact = findPresetNameFor(fixed);
    if (exact) {
      setSelectedPreset(exact);
      localStorage.setItem(PRESET_KEY, exact);
    } else {
      setSelectedPreset(null);
      localStorage.removeItem(PRESET_KEY);
    }
    onOpenChange(false);
  };

  const cancelChanges = () => {
    setTemp(colors);
    setTempFont(fontFamily);
    onOpenChange(false);
  };

  const copyCssVars = async () => {
    const css = `:root{
  --color-primary:${normalizeHex(temp.primary) ?? temp.primary};
  --color-secondary:${normalizeHex(temp.secondary) ?? temp.secondary};
  --color-accent:${normalizeHex(temp.accent) ?? temp.accent};
  --font-family:${tempFont};
}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(css);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = css;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { }
  };

  const toggleSection = (section: keyof typeof sectionsOpen) => {
    setSectionsOpen(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const preview = useMemo(
    () => ({
      nav: temp.primary,
      cta: temp.accent,
      chip1: temp.secondary,
      chip2: temp.accent,
      cardBorder: isDark ? "rgba(148,163,184,0.25)" : "rgba(15,23,42,0.08)",
    }),
    [temp, isDark]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300"
        onClick={cancelChanges}
      />
      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-full sm:w-[560px] bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200/70 dark:border-slate-800 overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div
          className="relative p-6 border-b border-slate-200/70 dark:border-slate-800"
          style={{
            background: `linear-gradient(135deg, ${temp.primary} 0%, ${temp.secondary} 60%, ${temp.accent} 100%)`,
          }}
        >
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(1000px_300px_at_0%_0%,white,transparent)]" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
                <Palette className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white drop-shadow">
                  {effectiveTitle}
                </h2>
                <p className="text-sm text-white/80">{effectiveSubtitle}</p>
              </div>
            </div>
            <button
              onClick={cancelChanges}
              className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          className="h-[calc(100%-168px)] overflow-y-auto p-6 space-y-6 custom-scrollbar"
          style={{
            ["--color-primary" as any]:
              normalizeHex(temp.primary) ?? temp.primary,
            ["--color-secondary" as any]:
              normalizeHex(temp.secondary) ?? temp.secondary,
            ["--color-accent" as any]: normalizeHex(temp.accent) ?? temp.accent,
          }}
        >
          {/* Dark Mode */}
          <div className="flex items-center justify-between p-4 rounded-2xl border bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 transition-all hover:shadow-md">
            <div className="flex items-center gap-3">
              {isDark ? (
                <Moon className="w-5 h-5 text-slate-400" />
              ) : (
                <Sun className="w-5 h-5 text-slate-600" />
              )}
              <div>
                <h3 className="font-medium text-slate-900 dark:text-white">
                  {t('theme.darkMode') || "Dark Mode"}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {t('theme.darkModeDescription') || "Switch between light and dark"}
                </p>
              </div>
            </div>
            <button
              onClick={toggleDarkMode}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ${isDark ? "bg-indigo-600" : "bg-slate-300"
                }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 shadow-sm ${isDark ? "translate-x-6" : "translate-x-1"
                  }`}
              />
            </button>
          </div>

          {/* Colors Section */}
          <div className="rounded-2xl border bg-white/60 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => toggleSection('colors')}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Palette className="w-5 h-5" />
                {t('theme.colors') || "Colors"}
              </h3>
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${sectionsOpen.colors ? 'rotate-180' : ''}`} />
            </button>
            {sectionsOpen.colors && (
              <div className="p-4 pt-0 space-y-4 animate-fade-in">
                {/* Presets */}
                <div>
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                    {t('theme.classyPresets') || "Classy Palettes"}
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {classyPresets.map((p) => {
                      const isSelected = selectedPreset === p.name;
                      return (
                        <button
                          key={p.name}
                          onClick={() => applyPreset(p)}
                          className={`group p-3 rounded-xl border bg-white/60 dark:bg-slate-800/50 transition-all hover:scale-105
                            ${isSelected
                              ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800 shadow-md"
                              : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                            }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className="w-4 h-4 rounded-full shadow-sm"
                              style={{ backgroundColor: p.primary }}
                            />
                            <span
                              className="w-4 h-4 rounded-full shadow-sm"
                              style={{ backgroundColor: p.secondary }}
                            />
                            <span
                              className="w-4 h-4 rounded-full shadow-sm"
                              style={{ backgroundColor: p.accent }}
                            />
                          </div>
                          <div className="text-left">
                            <p
                              className={`text-sm font-medium transition
                                ${isSelected
                                  ? "text-indigo-600 dark:text-indigo-400"
                                  : "text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                                }`}
                            >
                              {p.name}
                            </p>
                            {p.note && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {p.note}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Colors */}
                <div>
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                    {t('theme.customColors') || "Custom Colors"}
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    {(["primary", "secondary", "accent"] as (keyof Colors)[]).map(
                      (k) => (
                        <div key={k} className="space-y-2">
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 capitalize">
                            {t(`theme.${k}`) || k}
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={normalizeHex(temp[k]) ?? "#000000"}
                              onChange={(e) => handleChange(k, e.target.value)}
                              className="w-12 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={temp[k]}
                              onChange={(e) => handleChange(k, e.target.value)}
                              onBlur={() => handleBlur(k)}
                              placeholder="#AABBCC"
                              className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Typography Section */}
          <div className="rounded-2xl border bg-white/60 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => toggleSection('typography')}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Type className="w-5 h-5" />
                {t('theme.typography') || "Typography"}
              </h3>
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${sectionsOpen.typography ? 'rotate-180' : ''}`} />
            </button>
            {sectionsOpen.typography && (
              <div className="p-4 pt-0 space-y-3 animate-fade-in">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Choose a font family for your restaurant's brand
                </p>
                <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto custom-scrollbar">
                  {FONT_FAMILIES.map((font) => (
                    <button
                      key={font.value}
                      onClick={() => setTempFont(font.value)}
                      className={`p-3 rounded-xl border text-left transition-all hover:scale-[1.02]
                        ${tempFont === font.value
                          ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800 bg-indigo-50 dark:bg-indigo-900/20"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/50"
                        }`}
                      style={{ fontFamily: font.value }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">
                            {font.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                            {font.category}
                          </p>
                        </div>
                        <span className="text-lg" style={{ fontFamily: font.value }}>
                          Aa
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Live Preview Section */}
          <div className="rounded-2xl border bg-white/60 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => toggleSection('preview')}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t('theme.livePreview') || "Live Preview"}
              </h3>
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${sectionsOpen.preview ? 'rotate-180' : ''}`} />
            </button>
            {sectionsOpen.preview && (
              <div className="p-4 pt-0 animate-fade-in" style={{ fontFamily: tempFont }}>
                <div className="rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between bg-primary text-white">
                    <span className="font-semibold">{t('theme.brand') || "Restaurant Brand"}</span>
                    <div className="flex items-center gap-2">
                      <button className="text-xs px-3 py-1.5 rounded-lg border border-white/30 hover:bg-white/10 transition">
                        {t('theme.menu') || "Menu"}
                      </button>
                      <button className="text-xs px-3 py-1.5 rounded-lg border border-white/30 hover:bg-white/10 transition">
                        {t('theme.reserve') || "Reserve"}
                      </button>
                    </div>
                  </div>

                  <div className="p-4">
                    <div
                      className="rounded-xl border"
                      style={{ borderColor: preview.cardBorder }}
                    >
                      <div className="p-4 flex gap-4 items-start">
                        <div className="h-16 w-20 rounded-lg bg-slate-200 dark:bg-slate-700" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-slate-900 dark:text-white">
                              {t('theme.signatureDish') || "Signature Dish"}
                            </h4>
                            <Chip label={t('theme.chefsPick') || "Chef's Pick"} bg={preview.chip1} />
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {t('theme.dishDesc') || "A refined balance of texture and flavor, plated with elegance."}
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <Chip label={t('theme.halal') || "Halal"} bg={preview.chip2} />
                            <Chip label={t('theme.gf') || "GF"} bg={preview.chip1} />
                          </div>
                          <div className="mt-4 flex items-center justify-between">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              $18.00
                            </span>
                            <button className="btn btn-accent text-sm">{t('theme.addToCart') || "Add to Cart"}</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Copy CSS */}
          <div className="flex items-center gap-2">
            <button
              onClick={copyCssVars}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
            >
              <Copy className="w-4 h-4" />
              {copied ? t('theme.copied') || "Copied!" : t('theme.copyCss') || "Copy CSS"}
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t('theme.copyHint') || "Paste into a global stylesheet"}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="h-[88px] px-6 flex items-center justify-between border-t border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/80 backdrop-blur">
          <button
            onClick={resetToDefault}
            className="flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <RotateCcw className="w-4 h-4" />
            {t('theme.reset') || "Reset"}
          </button>
          <div className="flex gap-3">
            <button
              onClick={cancelChanges}
              className="px-5 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              {t('theme.cancel') || "Cancel"}
            </button>
            <button onClick={applyChanges} className="btn btn-primary">
              <Check className="w-4 h-4 mr-2" />
              {t('theme.apply') || "Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeCustomizer;
