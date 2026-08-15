import React, { useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Clock, TrendingUp } from 'lucide-react';

interface HourlyData {
  hour: number;
  day: number;
  count: number;
}

interface HourlyHeatmapProps {
  periods: HourlyData[];
}

const formatHour = (hour: number) => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
};

const HourlyHeatmap: React.FC<HourlyHeatmapProps> = ({ periods }) => {
  const { t } = useLanguage();
  const dayNames = useMemo(() => [
    t('common.sunday') || 'Sun',
    t('common.monday') || 'Mon',
    t('common.tuesday') || 'Tue',
    t('common.wednesday') || 'Wed',
    t('common.thursday') || 'Thu',
    t('common.friday') || 'Fri',
    t('common.saturday') || 'Sat',
  ], [t]);

  const busiestPeriods = useMemo(() => {
    return [...periods]
      .sort((a, b) => b.count - a.count || a.day - b.day || a.hour - b.hour)
      .slice(0, 4);
  }, [periods]);

  const peakCount = busiestPeriods[0]?.count || 1;
  const peak = busiestPeriods[0];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/25">
            <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">
              {t('analytics.busiestHours') || 'Busiest Hours'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('analytics.busiestHoursDescription')}
            </p>
          </div>
        </div>

        {peak && (
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs dark:border-emerald-800/60 dark:bg-emerald-900/20">
            <span className="text-slate-500 dark:text-slate-400">{t('analytics.peak')}</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-300">
              {dayNames[peak.day]} · {formatHour(peak.hour)}
            </span>
          </div>
        )}
      </div>

      {busiestPeriods.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
          <Clock className="h-4 w-4 text-slate-400" />
          {t('analytics.noData')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 dark:bg-slate-800">
          {busiestPeriods.map((period, index) => (
            <div key={`${period.day}-${period.hour}`} className="bg-white px-4 py-4 dark:bg-slate-900">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {index === 0 ? t('analytics.highestActivity') : t('analytics.peakRank', { rank: String(index + 1) })}
                  </p>
                  <p className="mt-1 text-sm font-extrabold text-slate-900 dark:text-white">
                    {dayNames[period.day]} · {formatHour(period.hour)}
                  </p>
                </div>
                <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {period.count}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                  style={{ width: `${Math.max((period.count / peakCount) * 100, 12)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                {period.count} {t('analytics.orders') || 'orders'}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default HourlyHeatmap;
