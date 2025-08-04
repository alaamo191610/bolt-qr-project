import React, { createContext, useContext, useState, useEffect } from 'react';

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

const defaultLightColors: ThemeColors = {
  primary: '#059669', // emerald-600
  secondary: '#0d9488', // teal-600
  accent: '#f59e0b', // amber-500
  background: '#f8fafc', // slate-50
  surface: '#ffffff',
  text: '#0f172a', // slate-900
  textSecondary: '#64748b' // slate-500
};

const defaultDarkColors: ThemeColors = {
  primary: '#10b981', // emerald-500
  secondary: '#14b8a6', // teal-500
  accent: '#fbbf24', // amber-400
  background: '#0f172a', // slate-900
  surface: '#1e293b', // slate-800
  text: '#f8fafc', // slate-50
  textSecondary: '#94a3b8' // slate-400
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(false);
  const [colors, setColors] = useState<ThemeColors>(defaultLightColors);

  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('restaurant-theme');
    const savedIsDark = localStorage.getItem('restaurant-dark-mode') === 'true';
    
    if (savedTheme) {
      setColors(JSON.parse(savedTheme));
    }
    setIsDark(savedIsDark);
    
    // Apply dark mode class
    if (savedIsDark) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  useEffect(() => {
    // Update CSS custom properties
    const root = document.documentElement;
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
  }, [colors]);

  const updateColors = (newColors: Partial<ThemeColors>) => {
    const updatedColors = { ...colors, ...newColors };
    setColors(updatedColors);
    localStorage.setItem('restaurant-theme', JSON.stringify(updatedColors));
  };

  const toggleDarkMode = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    localStorage.setItem('restaurant-dark-mode', newIsDark.toString());
    
    if (newIsDark) {
      document.documentElement.classList.add('dark');
      setColors(defaultDarkColors);
    } else {
      document.documentElement.classList.remove('dark');
      setColors(defaultLightColors);
    }
  };

  const resetToDefault = () => {
    const defaultColors = isDark ? defaultDarkColors : defaultLightColors;
    setColors(defaultColors);
    localStorage.setItem('restaurant-theme', JSON.stringify(defaultColors));
  };

  return (
    <ThemeContext.Provider value={{
      colors,
      updateColors,
      isDark,
      toggleDarkMode,
      resetToDefault
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};