'use client';

import React, { useMemo } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import OrderSummaryPDF from './OrderSummaryPDF';
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

  const fileName = useMemo(() => {
    const base = 'order-summary';
    const suffix = [
      dateRange?.replace(/\s+/g, ''), // remove spaces around the dash
      language,
    ].filter(Boolean).join('_');
    return suffix ? `${base}_${suffix}.pdf` : `${base}.pdf`;
  }, [dateRange, language]);

  return (
    <PDFDownloadLink
      document={
        <OrderSummaryPDF
          orders={orders}
          t={t}
          language={language}
          dateRange={dateRange}
        />
      }
      fileName={fileName}
      className={`px-4 py-2 rounded transition ${
        disabled
          ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
          : 'bg-blue-600 text-white hover:bg-blue-700'
      } ${className ?? ''}`}
      aria-disabled={disabled}
    >
      {({ loading }) =>
        disabled
          ? t('analytics.noData')
          : loading
            ? t('common.loading')
            : t('analytics.exportPDF')
      }
    </PDFDownloadLink>
  );
};

export default ExportOrdersPDFButton;