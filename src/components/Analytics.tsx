'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { BarChart3, TrendingUp, DollarSign, Clock, Users, Star } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import OrderTrendChart from '../components/charts/OrderTrendChart';
import StatusPieChart from '../components/charts/StatusPieChart';
import TopRevenueItemsChart from '../components/charts/TopRevenueItemsChart';
import TopTableRevenueChart from '../components/charts/TopTableRevenueChart';
import ExportOrdersPDFButton from '../components/exports/ExportOrdersPDFButton';
import type { OrderWithItems as PdfOrder } from '../lib/supabase';
import { supabase } from '../lib/supabase'; // ✅ fetch menu names here

type OrderStatus = 'pending' | 'preparing' | 'completed' | 'served' | 'cancelled';

interface OrderItem {
  id?: string;         // menu_item_id
  name?: string;       // legacy fallback
  name_en?: string;    // english
  name_ar?: string;    // arabic
  price: number;
  quantity: number;
}

interface Order {
  id: number;
  tableNumber: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus | string;
  timestamp: Date;
}

interface AnalyticsProps {
  orders: Order[];
}

interface TrendDay {
  date: string; // YYYY-MM-DD (local)
  day: string;  // localized short day label
  orders: number;
  revenue: number;
}

const isSameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const toLocalISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const Analytics: React.FC<AnalyticsProps> = ({ orders }) => {
  const { t, getLocalizedDayName, language } = useLanguage();
  const locale = language === 'ar' ? 'ar-QA' : 'en-QA';

  const money = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 }),
    [locale]
  );
  const numberFmt = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const pickLabel = (d: { name?: string; name_en?: string; name_ar?: string }) =>
    language === 'ar' ? (d.name_ar ?? d.name ?? d.name_en ?? '') : (d.name_en ?? d.name ?? d.name_ar ?? '');

  // ✅ 1) Fetch a menu index (id -> {id,name_en,name_ar}) once on client
  const [menuIndex, setMenuIndex] = useState<Record<string, { id: string; name_en: string; name_ar?: string }>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('menus')
        .select('id,name_en,name_ar');

      if (!error && data && mounted) {
        setMenuIndex(Object.fromEntries(data.map(m => [m.id, m])));
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ✅ 2) Weak fallback: map English name -> menu entry (used only when no id on the item)
  const menuByEnName = useMemo(() => {
    const map: Record<string, { id: string; name_en: string; name_ar?: string }> = {};
    Object.values(menuIndex).forEach(mi => {
      if (mi.name_en) map[mi.name_en.toLowerCase().trim()] = mi;
    });
    return map;
  }, [menuIndex]);

  const {
    totalRevenue,
    totalOrders,
    avgOrderValue,
    popularItems,          // [{ aggKey,id,name,name_en,name_ar,count }]
    topTables,
    topItemsByRevenue,     // [{ aggKey,id,name,name_en,name_ar,revenue }]
    topTablesByRevenue,
    revenueByStatus,
    statusData,
    weekTrend,
    transformedOrders,
  } = useMemo(() => {
    // Aggregators
    type ItemAgg = {
      id?: string;
      name?: string;
      name_en?: string;
      name_ar?: string;
      count: number;
      revenue: number;
    };

    const itemAgg = new Map<string, ItemAgg>();
    const tableCount = new Map<string, number>();
    const tableRevenue = new Map<string, number>();
    const statusRev = new Map<string, number>();
    const statusCount = new Map<string, number>();

    let totalRevenue = 0;

    for (const o of orders) {
      totalRevenue += o.total;

      tableCount.set(o.tableNumber, (tableCount.get(o.tableNumber) ?? 0) + 1);
      tableRevenue.set(o.tableNumber, (tableRevenue.get(o.tableNumber) ?? 0) + o.total);

      statusRev.set(o.status, (statusRev.get(o.status) ?? 0) + o.total);
      statusCount.set(o.status, (statusCount.get(o.status) ?? 0) + 1);

      for (const it of o.items) {
        // ✅ 3) ENRICH names from menus by id, else by English name
        let name_en = it.name_en ?? it.name; // if legacy 'name' is English
        let name_ar = it.name_ar;

        if (it.id && menuIndex[it.id]) {
          const m = menuIndex[it.id];
          name_en = name_en ?? m.name_en;
          name_ar = name_ar ?? m.name_ar;
        } else if (!it.id && !name_ar && name_en) {
          const m = menuByEnName[name_en.toLowerCase().trim()];
          if (m) name_ar = m.name_ar ?? name_ar;
        }

        const aggKey =
          it.id ??
          `${name_en ?? ''}|${name_ar ?? ''}|${it.name ?? ''}`.trim();

        const rec =
          itemAgg.get(aggKey) ??
          { id: it.id, name: it.name, name_en, name_ar, count: 0, revenue: 0 };

        rec.count += it.quantity;
        rec.revenue += it.price * it.quantity;

        // backfill progressively
        if (!rec.name_en && name_en) rec.name_en = name_en;
        if (!rec.name_ar && name_ar) rec.name_ar = name_ar;
        if (!rec.name && it.name) rec.name = it.name;

        itemAgg.set(aggKey, rec);
      }
    }

    const toSortedArr = (m: Map<string, number>) =>
      Array.from(m.entries()).sort(([, a], [, b]) => b - a);

    const popularItems = Array.from(itemAgg.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([aggKey, { id, name, name_en, name_ar, count }]) => ({
        aggKey, id, name, name_en, name_ar, count
      }));

    const topItemsByRevenue = Array.from(itemAgg.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)
      .map(([aggKey, { id, name, name_en, name_ar, revenue }]) => ({
        aggKey, id, name, name_en, name_ar, revenue
      }));

    const topTables = toSortedArr(tableCount).slice(0, 5).map(([table, count]) => ({ table, count }));
    const topTablesByRevenue = toSortedArr(tableRevenue).slice(0, 5).map(([table, revenue]) => ({ table, revenue }));
    const revenueByStatus = Object.fromEntries(statusRev.entries());
    const statusData = Array.from(statusCount.entries()).map(([status, count]) => ({ status, count }));

    // last 7 days (local)
    const today = new Date();
    const weekTrend: TrendDay[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const dayOrders = orders.filter(o => isSameLocalDay(o.timestamp, d));
      weekTrend.push({
        date: toLocalISODate(d),
        day: getLocalizedDayName(d, 'short'),
        orders: dayOrders.length,
        revenue: dayOrders.reduce((s, o) => s + o.total, 0),
      });
    }

    const transformedOrders: PdfOrder[] = orders.map(o => ({
      id: String(o.id),
      user_id: 'guest',
      table_id: o.tableNumber,
      created_at: o.timestamp.toISOString(),
      total: o.total,
      status: o.status as string,
      items: o.items.map(i => ({ name: pickLabel(i), quantity: i.quantity })), // snapshot localized label (optional)
    }));

    const totalOrders = orders.length;
    const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0;

    return {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      popularItems,
      topTables,
      topItemsByRevenue,
      topTablesByRevenue,
      revenueByStatus,
      statusData,
      weekTrend,
      transformedOrders,
    };
  // include menu deps so enrichment re-runs when menus arrive
  }, [orders, getLocalizedDayName, language, menuIndex, menuByEnName]);

  const topItemMax = popularItems[0]?.count || 1;
  const topTableMax = topTables[0]?.count || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-slate-900">{t('analytics.title')}</h2>
            <p className="text-slate-600">{t('analytics.subtitle')}</p>
          </div>
          <div className="flex justify-end">
            <ExportOrdersPDFButton
              orders={transformedOrders}
              t={t}
              language={language === 'ar' ? 'ar' : 'en'}
              dateRange={
                weekTrend.length
                  ? `${weekTrend[0].date} – ${weekTrend[weekTrend.length - 1].date}`
                  : undefined
              }
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
            {money.format(totalRevenue)}
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
            {numberFmt.format(totalOrders)}
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
            {money.format(avgOrderValue)}
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
            {numberFmt.format(orders.filter(o => o.status === 'served').length)}
          </div>
          <div className="text-sm text-amber-700">{t('analytics.ordersServed')}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Popular Items */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Star className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-bold text-slate-900">{t('analytics.popularItems')}</h3>
          </div>

          {!popularItems.length ? (
            <div className="text-slate-500 text-sm">{t('analytics.noData')}</div>
          ) : (
            <div className="space-y-4">
              {popularItems.map((item, index) => (
                <div key={item.id ?? item.aggKey} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm ${
                        index === 0 ? 'bg-yellow-500'
                          : index === 1 ? 'bg-gray-400'
                          : index === 2 ? 'bg-amber-600'
                          : 'bg-slate-400'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <span className="font-medium text-slate-900">
                      {pickLabel(item)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">
                      {numberFmt.format(item.count)} {t('analytics.orders')}
                    </span>
                    <div className="w-20 bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-emerald-600 h-2 rounded-full"
                        style={{ width: `${(item.count / topItemMax) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Tables */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Users className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-bold text-slate-900">{t('analytics.mostActiveTables')}</h3>
          </div>

          {!topTables.length ? (
            <div className="text-slate-500 text-sm">{t('analytics.noData')}</div>
          ) : (
            <div className="space-y-4">
              {topTables.map((table, index) => (
                <div key={table.table} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                      <span className="font-bold text-slate-700">#{index + 1}</span>
                    </div>
                    <span className="font-medium text-slate-900">
                      {t('common.table')} {table.table}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">
                      {numberFmt.format(table.count)} {t('analytics.orders')}
                    </span>
                    <div className="w-20 bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${(table.count / topTableMax) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Revenue by Status */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-6">{t('analytics.revenueByStatus')}</h3>
        {!Object.keys(revenueByStatus).length ? (
          <div className="text-slate-500 text-sm">{t('analytics.noData')}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(revenueByStatus).map(([status, revenue]) => (
              <div key={status} className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl font-bold text-slate-900 mb-1">
                  {money.format(revenue as number)}
                </div>
                <div className="text-sm text-slate-600">
                  {t(`analytics.status.${status}`)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Charts */}
      <TopTableRevenueChart data={topTablesByRevenue} t={t} />
      <TopRevenueItemsChart data={topItemsByRevenue} t={t} />
      <StatusPieChart data={statusData} t={t} />
      <OrderTrendChart data={weekTrend} t={t} />

      {/* Weekly Trend mini-cards */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-6">{t('analytics.weekTrend')}</h3>
        {!weekTrend.length ? (
          <div className="text-slate-500 text-sm">{t('analytics.noData')}</div>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {weekTrend.map((item, index) => (
              <div key={index} className="text-center">
                <div className="text-xs font-medium text-slate-600 mb-2">{item.day}</div>
                <div className="bg-slate-100 rounded-lg p-3">
                  <div className="text-lg font-bold text-slate-900 mb-1">
                    {numberFmt.format(item.orders)}
                  </div>
                  <div className="text-xs text-slate-600">{t('analytics.orders')}</div>
                  <div className="text-xs font-medium text-emerald-600 mt-1">
                    {money.format(item.revenue)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Analytics;