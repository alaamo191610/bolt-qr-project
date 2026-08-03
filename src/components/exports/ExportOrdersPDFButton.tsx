'use client';

import React, { useMemo, useState } from 'react';
import type { Order } from '../../lib/supabase';

interface OrderWithItems extends Order {
  items: { name: string; quantity: number; price?: number }[];
}

interface Props {
  orders: OrderWithItems[];
  t: (key: string) => string;
  language: 'en' | 'ar';
  dateRange?: string;      // e.g. "2025-08-01 – 2025-08-07"
  className?: string;
}

const ExportOrdersPDFButton: React.FC<Props> = ({ orders, t, language, dateRange, className }) => {
  const disabled = !orders || orders.length === 0;
  const [loading, setLoading] = useState(false);

  const fileName = useMemo(() => {
    const base = 'order-summary';
    const suffix = [
      dateRange?.replace(/\s+/g, ''), // remove spaces around the dash
      language,
    ].filter(Boolean).join('_');
    return suffix ? `${base}_${suffix}.pdf` : `${base}.pdf`;
  }, [dateRange, language]);

  const download = async () => {
    if (disabled || loading) return;
    setLoading(true);
    try {
      const [{ pdf }, { default: OrderSummaryPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./OrderSummaryPDF'),
      ]);
      const document = React.createElement(OrderSummaryPDF, { orders, t, language, dateRange });
      const blob = await pdf(document).toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={download}
      disabled={disabled || loading}
      className={`px-4 py-2 rounded transition ${
        disabled
          ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
          : 'bg-blue-600 text-white hover:bg-blue-700'
      } ${className ?? ''}`}
      aria-disabled={disabled || loading}
    >
      {disabled
        ? t('analytics.noData')
        : loading
          ? t('common.loading')
          : t('analytics.exportPDF')}
    </button>
  );
};

export default ExportOrdersPDFButton;
