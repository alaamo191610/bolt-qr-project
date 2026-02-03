import React, { useState } from "react";
import { Globe, ChevronDown } from "lucide-react";
import { useLanguage, Language } from "../../contexts/LanguageContext";

interface LanguageToggleProps {
  variant?: "button" | "dropdown";
  className?: string;
}

const LanguageToggle: React.FC<LanguageToggleProps> = ({
  variant = "dropdown",
  className = "",
}) => {
  const { language, setLanguage, t, isRTL } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const languages = [
    {
      code: "en" as Language,
      name: "English",
      nativeName: "English",
      flag: "🇺🇸",
    },
    {
      code: "ar" as Language,
      name: "Arabic",
      nativeName: "العربية",
      flag: "🇸🇦",
    },
  ];

  const currentLanguage = languages.find((lang) => lang.code === language);

  if (variant === "button") {
    return (
      <button
        onClick={() => setLanguage(language === "en" ? "ar" : "en")}
        className={`flex items-center space-x-2 rtl:space-x-reverse w-full px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors duration-200 ${className}`}
        title={`${t("language.switchTo")} ${language === "en" ? "العربية" : "English"
          }`}
      >
        <Globe className="w-4 h-4" />
        <span>{currentLanguage?.nativeName}</span>
      </button>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 rtl:space-x-reverse px-3 w-full py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors duration-200"
      >
        <Globe className="w-4 h-4" />
        <span>{currentLanguage?.nativeName}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""
            }`}
        />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-20 right-0 rtl:right-auto rtl:left-0">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setLanguage(lang.code);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200 ${language === lang.code
                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                    : "text-slate-700 dark:text-slate-300"
                  }`}
              >
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <span className="text-lg">{lang.flag}</span>
                  <div className={isRTL ? "text-right" : "text-left"}>
                    <div className="font-medium">{lang.nativeName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {lang.name}
                    </div>
                  </div>
                </div>
                {language === lang.code && (
                  <div className="w-2 h-2 bg-emerald-600 dark:bg-emerald-400 rounded-full"></div>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default LanguageToggle;
