// contexts/ThemeContext.tsx
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { fetchAdminTheme, updateAdminTheme, type AdminThemeRow } from '../services/adminService';

interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
}

interface ThemeContextType {
  colors: ThemeColors;
  updateColors: (newColors: Partial<ThemeColors>) => void;
  isDark: boolean;
  toggleDarkMode: () => void;
  resetToDefault: () => void;
}

const THEME_KEY = 'restaurant-theme:v2';
const DARK_KEY = 'restaurant-dark-mode';

const defaultLightColors: ThemeColors = {
  primary: '#059669',      // emerald-600
  secondary: '#0d9488',    // teal-600
  accent: '#f59e0b',       // amber-500
  background: '#f8fafc',   // slate-50
  surface: '#ffffff',
  text: '#0f172a',         // slate-900
  textSecondary: '#64748b' // slate-500
};

const defaultDarkColors: ThemeColors = {
  primary: '#10b981',      // emerald-500
  secondary: '#14b8a6',    // teal-500
  accent: '#fbbf24',       // amber-400
  background: '#0f172a',   // slate-900
  surface: '#1e293b',      // slate-800
  text: '#f8fafc',         // slate-50
  textSecondary: '#94a3b8' // slate-400
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Helpers */
const normalizeHex = (v?: string | null) => {
  if (!v) return null;
  let s = v.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map(ch => ch + ch).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return `#${s.toUpperCase()}`;
};
// Minimal derive if we only have a single primary (legacy theme_color)
const hexToHsl = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > .5 ? d / (2 - max - min) : d / (max + min);
    switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; default: h = (r - g) / d + 4; }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};
const hslToHex = ({ h, s, l }: { h: number; s: number; l: number }) => {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12,
    a = s * Math.min(l, 1 - l),
    f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))),
    toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
};
const shiftHue = (hex: string, delta: number) => {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex({ h: (h + delta + 360) % 360, s, l });
};
const deriveFromPrimary = (primary: string, base: ThemeColors): ThemeColors => {
  const p = normalizeHex(primary) ?? base.primary;
  const secondary = shiftHue(p, 25);
  const accent = shiftHue(p, -35);
  return { ...base, primary: p, secondary, accent };
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(false);
  const [colors, setColors] = useState<ThemeColors>(defaultLightColors);

  type Timeout = ReturnType<typeof setTimeout>;

  // keep your ref as this type
  const saveTimer = useRef<Timeout | null>(null);
  const equalPalette = (a: ThemeColors, b: ThemeColors) =>
    a.primary === b.primary && a.secondary === b.secondary && a.accent === b.accent;

  useEffect(() => {
    // 1) fast local boot
    const savedTheme = localStorage.getItem(THEME_KEY);
    const savedIsDark = localStorage.getItem(DARK_KEY) === 'true';
    if (savedTheme) setColors(JSON.parse(savedTheme));
    setIsDark(savedIsDark);
    if (savedIsDark) document.documentElement.classList.add('dark');

    // 2) hydrate from DB (authoritative)
    (async () => {
      try {
        const db: AdminThemeRow | null = await fetchAdminTheme();

        // resolve mode
        const systemDark =
          typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
        const wantDark =
          db?.theme_mode === 'dark' ||
          (db?.theme_mode === 'system' && systemDark) ||
          (db?.theme_mode == null && savedIsDark);

        setIsDark(wantDark);
        document.documentElement.classList.toggle('dark', wantDark);

        const base = wantDark ? defaultDarkColors : defaultLightColors;

        // Prefer jsonb theme if present
        const tp = db?.theme?.primary ? normalizeHex(db.theme.primary) : null;
        const ts = db?.theme?.secondary ? normalizeHex(db.theme.secondary) : null;
        const ta = db?.theme?.accent ? normalizeHex(db.theme.accent) : null;

        let merged: ThemeColors;

        if (tp || ts || ta) {
          merged = {
            ...base,
            primary: tp ?? base.primary,
            secondary: ts ?? base.secondary,
            accent: ta ?? base.accent,
          };
        } else if (db?.theme_color) {
          // legacy single primary → derive tasteful palette
          merged = deriveFromPrimary(db.theme_color, base);
        } else {
          merged = base;
        }

        setColors(merged);
        localStorage.setItem(THEME_KEY, JSON.stringify(merged));
        localStorage.setItem(DARK_KEY, String(wantDark));
      } catch (e) {
        console.error('Failed to hydrate theme', e);
        // ignore; stay on local values if offline/unauth
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);
  // Reflect CSS vars to :root
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
  }, [colors]);

  const persistThemeJsonb = (c: ThemeColors) => {
    // only persist the palette (primary/secondary/accent) to DB
    updateAdminTheme({
      theme: { primary: c.primary, secondary: c.secondary, accent: c.accent },
    }).catch(() => { });
  };

  const updateColors = (newColors: Partial<ThemeColors>) => {
    // Merge but keep background/surface/text from current theme
    const updated: ThemeColors = { ...colors, ...newColors };

    // If nothing about the palette actually changed, do nothing
    if (equalPalette(updated, colors)) return;

    setColors(updated);
    localStorage.setItem(THEME_KEY, JSON.stringify(updated));

    // Debounce DB write of full palette
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persistThemeJsonb(updated); // writes { primary, secondary, accent }
    }, 500);
  };

  const toggleDarkMode = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem(DARK_KEY, String(next));
    document.documentElement.classList.toggle('dark', next);

    // Rebase bg/surface/text to the new mode but KEEP current palette
    const base = next ? defaultDarkColors : defaultLightColors;
    const reBased: ThemeColors = {
      ...base,
      primary: colors.primary,
      secondary: colors.secondary,
      accent: colors.accent,
    };

    // Only update if something truly changed
    const paletteChanged = !equalPalette(reBased, colors) ||
      base.background !== colors.background ||
      base.surface !== colors.surface ||
      base.text !== colors.text ||
      base.textSecondary !== colors.textSecondary;

    if (paletteChanged) {
      setColors(reBased);
      localStorage.setItem(THEME_KEY, JSON.stringify(reBased));

      // Persist both theme_mode and the (same) palette so all devices stay aligned
      Promise.allSettled([
        updateAdminTheme({ theme_mode: next ? 'dark' : 'light' }),
        // Optional: persist palette too, in case another client is open
        (async () => persistThemeJsonb(reBased))(),
      ]).catch(() => { });
    } else {
      // Persist just the mode if palette didn't change
      updateAdminTheme({ theme_mode: next ? 'dark' : 'light' }).catch(() => { });
    }
  };

  const resetToDefault = () => {
    const base = isDark ? defaultDarkColors : defaultLightColors;
    setColors(base);
    localStorage.setItem(THEME_KEY, JSON.stringify(base));
    // reset DB palette to defaults for consistency across devices
    updateAdminTheme({
      theme: { primary: base.primary, secondary: base.secondary, accent: base.accent },
    }).catch(() => { });
  };

  return (
    <ThemeContext.Provider value={{ colors, updateColors, isDark, toggleDarkMode, resetToDefault }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};