import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

interface ChartWrapperProps {
  children: React.ReactNode;
  className?: string;
}

const ChartWrapper: React.FC<ChartWrapperProps> = ({ children, className }) => {
  const { isRTL } = useLanguage();

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className={className}>
      {children}
    </div>
  );
};

export default ChartWrapper;