'use client';

import React from 'react';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import ChartWrapper from './ChartWrapper';

interface TrendDay {
  date: string;
  orders: number;
  revenue: number;
}

interface Props {
  data: TrendDay[];
  t: (key: string) => string;
}

const OrderTrendChart: React.FC<Props> = ({ data, t }) => {

  return (
    <ChartWrapper className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900 mb-4">
        {t('analytics.weeklyTrendChart')}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="5 5" />
          <XAxis dataKey="day" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="orders" stroke="#3b82f6" name={t('analytics.orders')} />
          <Line type="monotone" dataKey="revenue" stroke="#10b981" name={t('analytics.revenue')} />
        </LineChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
};

export default OrderTrendChart;