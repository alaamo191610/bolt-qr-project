import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import ChartWrapper from './ChartWrapper';
import { useLanguage } from '../../contexts/LanguageContext';

interface ItemData {
  name: string;
  revenue: number;
}

interface Props {
  data: ItemData[];
  t: (key: string) => string;
}

const COLORS = ['#10b981', '#22c55e', '#34d399', '#4ade80', '#6ee7b7'];

const TopRevenueItemsChart: React.FC<Props> = ({ data, t }) => {
  const { isRTL, language } = useLanguage();

  return (
    <ChartWrapper className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <h3
        className={`text-lg font-bold mb-4 ${
          isRTL ? 'text-right' : 'text-left'
        } text-slate-900`}
      >
        {t('analytics.topRevenueItems')}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          layout="vertical"
          margin={
            isRTL
              ? { top: 20, right: 40, left: 10, bottom: 20 }
              : { top: 20, left: 40, right: 10, bottom: 20 }
          }
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            reversed={isRTL}
            tick={{ textAnchor: isRTL ? 'end' : 'start' }}
            axisLine={{ stroke: '#ccc' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ textAnchor: isRTL ? 'end' : 'start' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number) =>
              language === 'ar'
                ? `${value.toFixed(2)} ر.ق`
                : `$${value.toFixed(2)}`
            }
          />
          <Bar dataKey="revenue" fill="#10b981">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
};

export default TopRevenueItemsChart;