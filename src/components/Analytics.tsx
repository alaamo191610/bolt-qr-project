import React, { useCallback, useMemo } from 'react';
import { BarChart3, Clock, DollarSign, Star, TrendingUp, Users } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrency } from '../contexts/CurrencyContext';
import type { AnalyticsSummary } from '../services/adminService';

const OrderTrendChart = React.lazy(() => import('../components/charts/OrderTrendChart'));
const StatusPieChart = React.lazy(() => import('../components/charts/StatusPieChart'));
const TopRevenueItemsChart = React.lazy(() => import('../components/charts/TopRevenueItemsChart'));
const TopTableRevenueChart = React.lazy(() => import('../components/charts/TopTableRevenueChart'));
const HourlyHeatmap = React.lazy(() => import('../components/charts/HourlyHeatmap'));

interface AnalyticsProps {
  summary: AnalyticsSummary | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const Analytics: React.FC<AnalyticsProps> = ({ summary, loading = false, error, onRetry }) => {
  const { t, getLocalizedDayName, language } = useLanguage();
  const { formatPrice } = useCurrency();
  const locale = language === 'ar' ? 'ar-QA' : 'en-QA';
  const numberFmt = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  }), [locale]);
  const pickLabel = useCallback((item: { name_en?: string; name_ar?: string | null }) => (
    language === 'ar' ? item.name_ar || item.name_en || '' : item.name_en || item.name_ar || ''
  ), [language]);

  if (loading && !summary) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-slate-600">{t('common.loading')}</div>;
  }
  if (error && !summary) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-red-800" role="alert">
        <p>{error}</p>
        {onRetry && <button type="button" className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-white" onClick={onRetry}>Try again</button>}
      </div>
    );
  }

  const totals = summary?.totals || {
    totalRevenue: 0, totalOrders: 0, averageOrderValue: 0, servedOrders: 0,
  };
  const popularItems = summary?.popularItems || [];
  const topTables = summary?.topTables || [];
  const statusData = summary?.statusData || [];
  const revenueByStatus = summary?.revenueByStatus || {};
  const weekTrend = (summary?.dailyTrend || []).map(item => ({
    ...item,
    day: getLocalizedDayName(new Date(`${item.date}T12:00:00Z`), 'short'),
  }));
  const topItemMax = popularItems[0]?.count || 1;
  const topTableMax = topTables[0]?.count || 1;
  const rangeLabel = summary
    ? `${dateFmt.format(new Date(summary.range.start))} – ${dateFmt.format(new Date(summary.range.end))} · UTC`
    : '';

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-700">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-slate-900">{t('analytics.title')}</h2>
            <p className="text-slate-600">{t('analytics.subtitle')}</p>
          </div>
          <p className="text-sm text-slate-500">{rangeLabel}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: DollarSign, value: formatPrice(totals.totalRevenue), label: t('analytics.totalRevenue'), card: 'border-emerald-200 bg-emerald-50', iconClass: 'text-emerald-700', valueClass: 'text-emerald-900', labelClass: 'text-emerald-700' },
          { icon: BarChart3, value: numberFmt.format(totals.totalOrders), label: t('analytics.totalOrders'), card: 'border-blue-200 bg-blue-50', iconClass: 'text-blue-700', valueClass: 'text-blue-900', labelClass: 'text-blue-700' },
          { icon: Clock, value: formatPrice(totals.averageOrderValue), label: t('analytics.avgOrderValue'), card: 'border-purple-200 bg-purple-50', iconClass: 'text-purple-700', valueClass: 'text-purple-900', labelClass: 'text-purple-700' },
          { icon: Users, value: numberFmt.format(totals.servedOrders), label: t('analytics.ordersServed'), card: 'border-amber-200 bg-amber-50', iconClass: 'text-amber-700', valueClass: 'text-amber-900', labelClass: 'text-amber-700' },
        ].map(card => (
          <div key={card.label} className={`rounded-xl border p-6 ${card.card}`}>
            <div className="mb-3 flex items-center justify-between">
              <card.icon className={`h-5 w-5 ${card.iconClass}`} />
              <TrendingUp className={`h-4 w-4 ${card.iconClass}`} />
            </div>
            <p className={`text-2xl font-bold ${card.valueClass}`}>{card.value}</p>
            <p className={`text-sm ${card.labelClass}`}>{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-900">
            <Star className="h-5 w-5 text-emerald-600" />{t('analytics.popularItems')}
          </h3>
          {!popularItems.length ? <p className="text-sm text-slate-500">{t('analytics.noData')}</p> : (
            <div className="space-y-4">
              {popularItems.map((item, index) => (
                <div key={item.id ?? `${item.name_en}-${index}`} className="flex items-center justify-between gap-4">
                  <span className="font-medium text-slate-900">{index + 1}. {pickLabel(item)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">{numberFmt.format(item.count)}</span>
                    <div className="h-2 w-20 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-600" style={{ width: `${(item.count / topItemMax) * 100}%` }} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-900">
            <Users className="h-5 w-5 text-blue-600" />{t('analytics.mostActiveTables')}
          </h3>
          {!topTables.length ? <p className="text-sm text-slate-500">{t('analytics.noData')}</p> : (
            <div className="space-y-4">
              {topTables.map((table, index) => (
                <div key={table.table} className="flex items-center justify-between gap-4">
                  <span className="font-medium text-slate-900">{index + 1}. {t('common.table')} {table.table}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">{numberFmt.format(table.count)}</span>
                    <div className="h-2 w-20 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${(table.count / topTableMax) * 100}%` }} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-6 text-lg font-bold text-slate-900">{t('analytics.revenueByStatus')}</h3>
        {!Object.keys(revenueByStatus).length ? <p className="text-sm text-slate-500">{t('analytics.noData')}</p> : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Object.entries(revenueByStatus).map(([status, revenue]) => (
              <div key={status} className="rounded-lg bg-slate-50 p-4 text-center">
                <p className="text-2xl font-bold text-slate-900">{formatPrice(revenue)}</p>
                <p className="text-sm text-slate-600">{t(`analytics.status.${status}`)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <React.Suspense fallback={<div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">{t('common.loading')}</div>}>
        <HourlyHeatmap periods={summary?.hourlyActivity || []} />
        <TopTableRevenueChart data={topTables} t={t} />
        <TopRevenueItemsChart data={popularItems} t={t} />
        <StatusPieChart data={statusData} t={t} />
        <OrderTrendChart data={weekTrend} t={t} />
      </React.Suspense>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-6 text-lg font-bold text-slate-900">{t('analytics.weekTrend')}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {weekTrend.map(item => (
            <div key={item.date} className="rounded-lg bg-slate-100 p-3 text-center">
              <p className="text-xs font-medium text-slate-600">{item.day}</p>
              <p className="text-lg font-bold text-slate-900">{numberFmt.format(item.orders)}</p>
              <p className="text-xs font-medium text-emerald-600">{formatPrice(item.revenue)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Analytics;
