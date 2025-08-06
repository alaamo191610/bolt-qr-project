import React from 'react';
import { BarChart3, TrendingUp, DollarSign, Clock, Users, Star } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import OrderTrendChart from '../components/charts/OrderTrendChart';
import StatusPieChart from '../components/charts/StatusPieChart';
import TopRevenueItemsChart from '../components/charts/TopRevenueItemsChart';
import TopTableRevenueChart from '../components/charts/TopTableRevenueChart';
import ExportOrdersPDFButton from '../components/exports/ExportOrdersPDFButton';
import type { OrderWithItems } from '../lib/supabase';

interface Order {
  id: number;
  tableNumber: string;
  items: { name: string; price: number; quantity: number }[];
  total: number;
  status: string;
  timestamp: Date;
}

interface AnalyticsProps {
  orders: Order[];
}
interface TrendDay {
  date: string;
  day: string;
  orders: number;
  revenue: number;
}

const Analytics: React.FC<AnalyticsProps> = ({ orders }) => {
  const { t, getLocalizedDayName } = useLanguage();

  const getTotalRevenue = () => {
    return orders.reduce((total, order) => total + order.total, 0);
  };

  const getAverageOrderValue = () => {
    if (orders.length === 0) return 0;
    return getTotalRevenue() / orders.length;
  };

  const getTotalOrders = () => {
    return orders.length;
  };

  const getPopularItems = () => {
    const itemCounts: { [key: string]: number } = {};

    orders.forEach(order => {
      order.items.forEach(item => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
      });
    });

    return Object.entries(itemCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  };
  const getTopItemsByRevenue = () => {
    const itemRevenue: { [key: string]: number } = {};

    orders.forEach(order => {
      order.items.forEach(item => {
        const itemTotal = item.price * item.quantity;
        itemRevenue[item.name] = (itemRevenue[item.name] || 0) + itemTotal;
      });
    });

    return Object.entries(itemRevenue)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, revenue]) => ({ name, revenue }));
  };

  const getRevenueByStatus = () => {
    const statusRevenue: { [key: string]: number } = {};

    orders.forEach(order => {
      statusRevenue[order.status] = (statusRevenue[order.status] || 0) + order.total;
    });

    return statusRevenue;
  };

  const getStatusDistribution = () => {
    const statusCounts: { [key: string]: number } = {};

    orders.forEach(order => {
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    });

    return Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    }));
  };
  const getRevenueByTable = () => {
    const tableRevenue: { [key: string]: number } = {};

    orders.forEach(order => {
      tableRevenue[order.tableNumber] = (tableRevenue[order.tableNumber] || 0) + order.total;
    });

    return Object.entries(tableRevenue)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([table, revenue]) => ({ table, revenue }));
  };

  const getOrdersByTable = () => {
    const tableOrders: { [key: string]: number } = {};

    orders.forEach(order => {
      tableOrders[order.tableNumber] = (tableOrders[order.tableNumber] || 0) + 1;
    });

    return Object.entries(tableOrders)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([table, count]) => ({ table, count }));
  };
  const transformedOrders: OrderWithItems[] = orders.map(o => ({
    id: String(o.id),
    user_id: 'guest', // or real user ID if you have it
    table_id: o.tableNumber,
    created_at: o.timestamp.toISOString(),
    total: o.total,
    status: o.status,
    items: o.items.map(i => ({
      name: i.name,
      quantity: i.quantity,
    })),
  }));
  const getOrderTrend = (): TrendDay[] => {
    const today = new Date();
    const last7Days: TrendDay[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      const dayOrders = orders.filter(order => {
        const orderDate = new Date(order.timestamp);
        return orderDate.toDateString() === date.toDateString();
      });

      last7Days.push({
        date: date.toISOString().slice(0, 10),
        day: getLocalizedDayName(date, 'short'), // this will now be correctly "الاثنين" etc. in Arabic
        orders: dayOrders.length,
        revenue: dayOrders.reduce((sum, order) => sum + order.total, 0),
      });
    }

    return last7Days;
  };



  const popularItems = getPopularItems();
  const revenueByStatus = getRevenueByStatus();
  const statusData = getStatusDistribution();
  const topTables = getOrdersByTable();
  const topItemsByRevenue = getTopItemsByRevenue();
  const topTablesByRevenue = getRevenueByTable();
  const weekTrend = getOrderTrend();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{t('analytics.title')}</h2>
            <p className="text-slate-600">{t('analytics.subtitle')}</p>
          </div>
          <div className="flex justify-end">
            <ExportOrdersPDFButton
              orders={transformedOrders}
              t={t}
              language={typeof window !== 'undefined' && window.location.search.includes('lang=ar') ? 'ar' : 'en'}
              dateRange={`${weekTrend[0]?.date} – ${weekTrend[6]?.date}`}
            />
          </div>

        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-6 border border-emerald-200">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-white" />
            </div>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-900 mb-1">
            ${getTotalRevenue().toFixed(2)}
          </div>
          <div className="text-sm text-emerald-700">{t('analytics.totalRevenue')}</div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-900 mb-1">
            {getTotalOrders()}
          </div>
          <div className="text-sm text-blue-700">{t('analytics.totalOrders')}</div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-6 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <TrendingUp className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-purple-900 mb-1">
            ${getAverageOrderValue().toFixed(2)}
          </div>
          <div className="text-sm text-purple-700">{t('analytics.avgOrderValue')}</div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 text-white" />
            </div>
            <TrendingUp className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-900 mb-1">
            {orders.filter(order => order.status === 'served').length}
          </div>
          <div className="text-sm text-amber-700">{t('analytics.ordersServed')}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Popular Items */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center space-x-2 mb-6">
            <Star className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-bold text-slate-900">{t('analytics.popularItems')}</h3>
          </div>
          <div className="space-y-4">
            {popularItems.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm ${index === 0 ? 'bg-yellow-500' :
                      index === 1 ? 'bg-gray-400' :
                        index === 2 ? 'bg-amber-600' : 'bg-slate-400'
                    }`}>
                    {index + 1}
                  </div>
                  <span className="font-medium text-slate-900">{item.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-slate-600">{item.count} {t('analytics.orders')}</span>
                  <div className="w-16 bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-emerald-600 h-2 rounded-full"
                      style={{ width: `${(item.count / popularItems[0].count) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Tables */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center space-x-2 mb-6">
            <Users className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-bold text-slate-900">{t('analytics.mostActiveTables')}</h3>
          </div>
          <div className="space-y-4">
            {topTables.map((table, index) => (
              <div key={table.table} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                    <span className="font-bold text-slate-700">#{index + 1}</span>
                  </div>
                  <span className="font-medium text-slate-900">{t('common.table')} {table.table}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-slate-600">{table.count} {t('analytics.orders')}</span>
                  <div className="w-16 bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${(table.count / topTables[0].count) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue by Status */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-6">{t('analytics.revenueByStatus')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(revenueByStatus).map(([status, revenue]) => (
            <div key={status} className="text-center p-4 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-slate-900 mb-1">
                ${revenue.toFixed(2)}
              </div>
              <div className="text-sm text-slate-600 capitalize">{status}</div>
            </div>
          ))}
        </div>
      </div>
      <TopTableRevenueChart data={topTablesByRevenue} t={t} />
      <TopRevenueItemsChart data={topItemsByRevenue} t={t} />
      <StatusPieChart data={statusData} t={t} />
      <OrderTrendChart data={weekTrend} t={t} />
      {/* Weekly Trend */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-6">{t('analytics.weekTrend')}</h3>
        <div className="grid grid-cols-7 gap-2">
          {weekTrend.map((item, index) => (
            <div key={index} className="text-center">
              <div className="text-xs font-medium text-slate-600 mb-2">{item.day}</div>
              <div className="bg-slate-100 rounded-lg p-3">
                <div className="text-lg font-bold text-slate-900 mb-1">{item.orders}</div>
                <div className="text-xs text-slate-600">{t('analytics.orders')}</div>
                <div className="text-xs font-medium text-emerald-600 mt-1">
                  ${item.revenue.toFixed(0)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

};

export default Analytics;