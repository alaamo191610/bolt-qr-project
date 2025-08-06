import React from 'react';
import { Clock } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface Props {
  tableNumber: string;
}

const OrderConfirmation: React.FC<Props> = ({ tableNumber }) => {
  const { t, isRTL } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900 dark:to-green-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
        {/* Success Icon */}
        <div className="w-16 h-16 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600 dark:text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Title & Message */}
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {t('menu.orderPlaced')}
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          {t('menu.orderPlacedDescription', { table: tableNumber })}
        </p>

        {/* Time Estimate */}
        <div className={`flex items-center justify-center space-x-2 ${isRTL ? 'space-x-reverse' : ''} text-sm text-slate-500 dark:text-slate-400`}>
          <Clock className="w-4 h-4" />
          <span>{t('menu.estimatedTime')}</span>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmation;