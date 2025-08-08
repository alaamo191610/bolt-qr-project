'use client';

import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts';
import ChartWrapper from './ChartWrapper';
import { useLanguage } from '../../contexts/LanguageContext';

interface TableData {
  table: string;
  revenue: number;
}

interface Props {
  data: TableData[];
  t: (key: string) => string;
}

const COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'];

const TopTableRevenueChart: React.FC<Props> = ({ data, t }) => {
  const { language, isRTL } = useLanguage();
  const locale = language === 'ar' ? 'ar-QA' : 'en-QA';

  const moneyFmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 }),
    [locale]
  );
  const compactMoneyFmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'QAR', notation: 'compact', maximumFractionDigits: 1 }),
    [locale]
  );

  // Ensure top-5 and stable order (in case upstream isn't sorted)
  const prepared = useMemo(
    () => [...(data || [])].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    [data]
  );

  // Give Y axis enough width for long labels
  const yAxisWidth = useMemo(() => {
    const maxLen = prepared.reduce((m, d) => Math.max(m, d.table?.length || 0), 0);
    return Math.min(220, Math.max(80, maxLen * 8)); // ~8px per char
  }, [prepared]);

  if (!prepared.length) {
    return (
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-2">
          {t('analytics.topRevenueTables')}
        </h3>
        <div className="text-slate-500 text-sm">{t('analytics.noData')}</div>
      </div>
    );
  }

  return (
    <ChartWrapper className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <h3 className={`text-lg font-bold mb-4 ${isRTL ? 'text-right' : 'text-left'} text-slate-900`}>
        {t('analytics.topRevenueTables')}
      </h3>

      {/* Keep chart internals LTR so axes behave predictably in RTL UIs */}
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
              dataKey="table"
              width={yAxisWidth}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: number) => moneyFmt.format(Number(value))}
              wrapperStyle={{ direction: 'ltr' }}
            />
            <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 4, 4]}>
              {prepared.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
              <LabelList
                dataKey="revenue"
                position="right"
                // Recharts typings expect (label: ReactNode) => ReactNode
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

export default TopTableRevenueChart;