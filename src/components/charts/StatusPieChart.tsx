'use client';

import React from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface StatusData {
  status: string;
  count: number;
}

interface Props {
  data: StatusData[];
  t: (key: string) => string;
}

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444']; // Adjust colors for statuses

const StatusPieChart: React.FC<Props> = ({ data, t }) => {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900 mb-4">
        {t('analytics.statusDistribution')}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            dataKey="count"
            nameKey="status"
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={100}
            label={({ payload, percent }) =>
                `${t(`analytics.status.${payload.status}`)} (${((percent ?? 0) * 100).toFixed(0)}%)`
              }              
              
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: any, name: any) => [`${value}`, t(`analytics.status.${name}`)]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StatusPieChart;