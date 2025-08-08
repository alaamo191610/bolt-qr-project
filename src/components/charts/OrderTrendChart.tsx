'use client';

import React, { useMemo } from 'react';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import ChartWrapper from './ChartWrapper';

type TrendDay = {
  date: string;       // "YYYY-MM-DD"
  day?: string;       // localized short day label, e.g. "Mon" / "الاث"
  orders: number;
  revenue: number;
};

interface Props {
  data: TrendDay[];
  t: (key: string) => string;
  locale?: string;    // defaults keep it working without wiring context
  currency?: string;  // e.g. 'QAR'
}

const OrderTrendChart: React.FC<Props> = ({ data, t, locale = 'en-QA', currency = 'QAR' }) => {
  const numberFmt = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const moneyFmt  = useMemo(() => new Intl.NumberFormat(locale, { style: 'currency', currency }), [locale, currency]);

  if (!data || data.length === 0) {
    return (
      <ChartWrapper className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-2">
          {t('analytics.weeklyTrendChart')}
        </h3>
        <div className="text-slate-500 text-sm">{t('analytics.noData')}</div>
      </ChartWrapper>
    );
  }

  return (
    <ChartWrapper className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900 mb-4">
        {t('analytics.weeklyTrendChart')}
      </h3>

      {/* Keep chart internals LTR so axes/ticks render predictably in RTL UIs */}
      <div style={{ direction: 'ltr' }}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="5 5" />

            <XAxis
              dataKey="day"
              tickFormatter={(v: string, i: number) => v || data[i]?.date || ''}
              tickMargin={8}
            />

            {/* Left = orders (count) */}
            <YAxis
              yAxisId="orders"
              tickFormatter={(v) => numberFmt.format(Number(v))}
              width={44}
            />

            {/* Right = revenue (currency) */}
            <YAxis
              yAxisId="revenue"
              orientation="right"
              tickFormatter={(v) => moneyFmt.format(Number(v))}
              width={64}
            />

            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === 'orders') return [numberFmt.format(value), t('analytics.orders')];
                if (name === 'revenue') return [moneyFmt.format(value), t('analytics.revenue')];
                return [String(value), name];
              }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.day ?? payload?.[0]?.payload?.date ?? ''}
            />

            <Legend />

            <Line
              type="monotone"
              dataKey="orders"
              yAxisId="orders"
              name={t('analytics.orders')}
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              yAxisId="revenue"
              name={t('analytics.revenue')}
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
};

export default OrderTrendChart;