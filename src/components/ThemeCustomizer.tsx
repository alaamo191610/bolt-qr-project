import React, { useState } from 'react';
import { Palette, Sun, Moon, RotateCcw, Check, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeCustomizer: React.FC = () => {
  const { colors, updateColors, isDark, toggleDarkMode, resetToDefault } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [tempColors, setTempColors] = useState(colors);

  const colorPresets = [
    { name: 'Emerald', primary: '#059669', secondary: '#0d9488', accent: '#f59e0b' },
    { name: 'Blue', primary: '#2563eb', secondary: '#0891b2', accent: '#f97316' },
    { name: 'Purple', primary: '#7c3aed', secondary: '#c026d3', accent: '#eab308' },
    { name: 'Rose', primary: '#e11d48', secondary: '#dc2626', accent: '#06b6d4' },
    { name: 'Indigo', primary: '#4f46e5', secondary: '#7c2d12', accent: '#84cc16' },
  ];

  const handleColorChange = (colorKey: keyof typeof colors, value: string) => {
    setTempColors(prev => ({ ...prev, [colorKey]: value }));
  };

  const applyChanges = () => {
    updateColors(tempColors);
    setIsOpen(false);
  };

  const cancelChanges = () => {
    setTempColors(colors);
    setIsOpen(false);
  };

  const applyPreset = (preset: typeof colorPresets[0]) => {
    const newColors = {
      ...tempColors,
      primary: preset.primary,
      secondary: preset.secondary,
      accent: preset.accent
    };
    setTempColors(newColors);
  };

  return (
    <>
      {/* Theme Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-50 w-14 h-14 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group"
        title="Customize Theme"
      >
        <Palette className="w-6 h-6 group-hover:scale-110 transition-transform duration-200" />
      </button>

      {/* Theme Customizer Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center">
                    <Palette className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Theme Customizer</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Personalize your restaurant's appearance</p>
                  </div>
                </div>
                <button
                  onClick={cancelChanges}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors duration-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-8">
              {/* Dark Mode Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700 rounded-xl">
                <div className="flex items-center space-x-3">
                  {isDark ? <Moon className="w-5 h-5 text-slate-600 dark:text-slate-400" /> : <Sun className="w-5 h-5 text-slate-600" />}
                  <div>
                    <h3 className="font-medium text-slate-900 dark:text-white">Dark Mode</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Toggle between light and dark themes</p>
                  </div>
                </div>
                <button
                  onClick={toggleDarkMode}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                    isDark ? 'bg-purple-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                      isDark ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Color Presets */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Color Presets</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {colorPresets.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => applyPreset(preset)}
                      className="p-4 rounded-xl border-2 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 transition-all duration-200 group"
                    >
                      <div className="flex space-x-2 mb-2">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: preset.primary }}
                        />
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: preset.secondary }}
                        />
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: preset.accent }}
                        />
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors duration-200">
                        {preset.name}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Colors */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Custom Colors</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(tempColors).map(([key, value]) => (
                    <div key={key} className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </label>
                      <div className="flex items-center space-x-3">
                        <input
                          type="color"
                          value={value}
                          onChange={(e) => handleColorChange(key as keyof typeof colors, e.target.value)}
                          className="w-12 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => handleColorChange(key as keyof typeof colors, e.target.value)}
                          className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Preview</h3>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-600 space-y-3">
                  <div
                    className="px-4 py-2 rounded-lg text-white font-medium"
                    style={{ backgroundColor: tempColors.primary }}
                  >
                    Primary Button
                  </div>
                  <div
                    className="px-4 py-2 rounded-lg text-white font-medium"
                    style={{ backgroundColor: tempColors.secondary }}
                  >
                    Secondary Button
                  </div>
                  <div
                    className="px-4 py-2 rounded-lg text-white font-medium"
                    style={{ backgroundColor: tempColors.accent }}
                  >
                    Accent Button
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <button
                onClick={resetToDefault}
                className="flex items-center space-x-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors duration-200"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset to Default</span>
              </button>
              <div className="flex space-x-3">
                <button
                  onClick={cancelChanges}
                  className="px-6 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={applyChanges}
                  className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-200"
                >
                  <Check className="w-4 h-4" />
                  <span>Apply Changes</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ThemeCustomizer;