'use client';

import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

interface ChartWrapperProps {
  children: React.ReactNode;
  className?: string;
  /** Force a specific direction; otherwise uses language */
  dirOverride?: 'ltr' | 'rtl';
}

const ChartWrapper: React.FC<ChartWrapperProps> = ({ children, className, dirOverride }) => {
  const { isRTL } = useLanguage();
  const dir = dirOverride ?? (isRTL ? 'rtl' : 'ltr');
  const lang = isRTL ? 'ar' : 'en';

  return (
    <div dir={dir} lang={lang} className={className}>
      {children}
    </div>
  );
};

export default ChartWrapper;