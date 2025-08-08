'use client';

import React, { useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import ChartWrapper from './ChartWrapper';
import { useLanguage } from '../../contexts/LanguageContext';

interface StatusData {
  status: string; // e.g. 'pending' | 'preparing' | 'completed' | 'served' | 'cancelled'
  count: number;
}

interface Props {
  data: StatusData[];
  t: (key: string) => string;
}

// Consistent colors per canonical status; fallback palette for unknowns
const STATUS_COLORS: Record<string, string> = {
  pending:   '#f59e0b', // amber-500
  preparing: '#3b82f6', // blue-500
  completed: '#10b981', // emerald-500
  served:    '#22c55e', // green-500
  cancelled: '#ef4444', // red-500
};
const FALLBACKS = ['#06b6d4', '#a78bfa', '#f97316', '#14b8a6', '#8b5cf6'];

const StatusPieChart: React.FC<Props> = ({ data, t }) => {
  const { language, isRTL } = useLanguage();
  const locale = language === 'ar' ? 'ar-QA' : 'en-QA';

  const numberFmt  = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const percentFmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }),
    [locale]
  );

  // Clean + annotate data
  const prepared = useMemo(() => {
    const filtered = (data || []).filter(d => d && d.count > 0);
    return filtered.map((d, i) => {
      const label = t(`analytics.status.${d.status}`);
      const color = STATUS_COLORS[d.status] ?? FALLBACKS[i % FALLBACKS.length];
      return { ...d, label, color };
    });
  }, [data, t]);

  const total = useMemo(
    () => prepared.reduce((s, d) => s + d.count, 0),
    [prepared]
  );

  if (!prepared.length || total === 0) {
    return (
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-2">
          {t('analytics.statusDistribution')}
        </h3>
        <div className="text-slate-500 text-sm">{t('analytics.noData')}</div>
      </div>
    );
  }

  return (
    <ChartWrapper className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <h3 className={`text-lg font-bold mb-4 ${isRTL ? 'text-right' : 'text-left'} text-slate-900`}>
        {t('analytics.statusDistribution')}
      </h3>

      {/* Keep chart internals LTR so angles/labels behave in RTL UIs */}
      <div style={{ direction: 'ltr' }}>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              dataKey="count"
              nameKey="label"
              data={prepared}
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={(props: any) => {
                const pct = percentFmt.format(props.percent ?? 0);
                return `${props.payload.label} (${pct})`;
              }}
              labelLine={false}
            >
              {prepared.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>

            <Tooltip
              // value = slice value; name = nameKey ('label')
              formatter={(value: number, name: string, p: any) => {
                const countStr = numberFmt.format(Number(value));
                const pct = percentFmt.format((p?.payload?.count ?? 0) / total);
                return [`${countStr} • ${pct}`, name]; // [value, label]
              }}
              wrapperStyle={{ direction: 'ltr' }}
            />

            <Legend
              formatter={(value: string /* label */) => value}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
};

export default StatusPieChart;