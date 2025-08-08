'use client';

import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts';
import ChartWrapper from './ChartWrapper';
import { useLanguage } from '../../contexts/LanguageContext';

interface ItemData {
  revenue: number;
  name?: string;     // fallback
  name_en?: string;  // ✅ english
  name_ar?: string;  // ✅ arabic
}

interface Props {
  data: ItemData[];
  t: (key: string) => string;
}

const COLORS = ['#10b981', '#22c55e', '#34d399', '#4ade80', '#6ee7b7'];

const TopRevenueItemsChart: React.FC<Props> = ({ data, t }) => {
  const { isRTL, language } = useLanguage();
  const locale = language === 'ar' ? 'ar-QA' : 'en-QA';

  const moneyFmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 }),
    [locale]
  );
  const compactMoneyFmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'QAR', notation: 'compact', maximumFractionDigits: 1 }),
    [locale]
  );

  const sorted = useMemo(
    () => [...(data || [])].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    [data]
  );

  const prepared = useMemo(() => {
    const pick = (d: ItemData) =>
      language === 'ar' ? (d.name_ar ?? d.name ?? d.name_en ?? '') : (d.name_en ?? d.name ?? d.name_ar ?? '');
    return sorted.map(d => ({ ...d, displayName: pick(d) }));
  }, [sorted, language]);

  const yAxisWidth = useMemo(() => {
    const maxLen = prepared.reduce((m, d) => Math.max(m, d.displayName?.length || 0), 0);
    return Math.min(220, Math.max(90, maxLen * 8));
  }, [prepared]);

  if (!prepared.length) {
    return (
      <ChartWrapper className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className={`text-lg font-bold mb-2 ${isRTL ? 'text-right' : 'text-left'} text-slate-900`}>
          {t('analytics.topRevenueItems')}
        </h3>
        <div className="text-slate-500 text-sm">{t('analytics.noData')}</div>
      </ChartWrapper>
    );
  }

  return (
    <ChartWrapper className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <h3 className={`text-lg font-bold mb-4 ${isRTL ? 'text-right' : 'text-left'} text-slate-900`}>
        {t('analytics.topRevenueItems')}
      </h3>

      {/* Keep chart internals LTR so axes behave in RTL UIs */}
      <div style={{ direction: 'ltr' }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={prepared}
            layout="vertical"
            margin={{ top: 12, right: 24, left: 24, bottom: 12 }}
            barCategoryGap={8}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              domain={[0, 'dataMax']}
              tickFormatter={(v) => compactMoneyFmt.format(Number(v))}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="displayName"
              width={yAxisWidth}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: number) => moneyFmt.format(Number(value))}
              wrapperStyle={{ direction: 'ltr' }}
            />
            <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 4, 4]}>
              {prepared.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
              <LabelList
                dataKey="revenue"
                position="right"
                // Recharts types expect (label: ReactNode) => ReactNode
                formatter={(label: React.ReactNode) => {
                  const num = typeof label === 'number' ? label : Number(label);
                  return Number.isFinite(num) ? compactMoneyFmt.format(num) : String(label ?? '');
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
};

export default TopRevenueItemsChart;