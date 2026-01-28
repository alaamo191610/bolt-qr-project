import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { TrendingUp, Clock } from 'lucide-react';

interface HourlyData {
    hour: number;
    day: number;
    count: number;
}

interface HourlyHeatmapProps {
    orders: any[];
}

const HourlyHeatmap: React.FC<HourlyHeatmapProps> = ({ orders }) => {
    const { t } = useLanguage();

    // Process orders into hourly data
    const processOrders = (): HourlyData[] => {
        const heatmapData: Map<string, number> = new Map();

        // Initialize all hours x days with 0
        for (let day = 0; day < 7; day++) {
            for (let hour = 0; hour < 24; hour++) {
                heatmapData.set(`${day}-${hour}`, 0);
            }
        }

        // Count orders per hour per day
        orders.forEach((order) => {
            const date = new Date(order.timestamp || order.created_at);
            const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
            const hour = date.getHours();
            const key = `${dayOfWeek}-${hour}`;
            heatmapData.set(key, (heatmapData.get(key) || 0) + 1);
        });

        // Convert to array format
        const result: HourlyData[] = [];
        heatmapData.forEach((count, key) => {
            const [day, hour] = key.split('-').map(Number);
            result.push({ day, hour, count });
        });

        return result;
    };

    const heatmapData = processOrders();
    const maxCount = Math.max(...heatmapData.map(d => d.count), 1);
    const totalOrders = heatmapData.reduce((sum, d) => sum + d.count, 0);

    // Find peak hour
    const peakData = heatmapData.reduce((max, d) => d.count > max.count ? d : max, heatmapData[0]);

    // Enhanced color system - crisper, less "glowy" for compact view
    const getColorClasses = (count: number): string => {
        if (count === 0) return 'bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800';

        const intensity = count / maxCount;

        if (intensity >= 0.8) return 'bg-emerald-600 border border-emerald-700';
        if (intensity >= 0.6) return 'bg-emerald-500 border border-emerald-600';
        if (intensity >= 0.4) return 'bg-emerald-400 border border-emerald-500';
        if (intensity >= 0.2) return 'bg-emerald-300 border border-emerald-400';
        return 'bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800';
    };

    const dayNames = [
        { short: t('common.sunday') || 'Sun', full: 'Sunday' },
        { short: t('common.monday') || 'Mon', full: 'Monday' },
        { short: t('common.tuesday') || 'Tue', full: 'Tuesday' },
        { short: t('common.wednesday') || 'Wed', full: 'Wednesday' },
        { short: t('common.thursday') || 'Thu', full: 'Thursday' },
        { short: t('common.friday') || 'Fri', full: 'Friday' },
        { short: t('common.saturday') || 'Sat', full: 'Saturday' },
    ];

    const hours = Array.from({ length: 24 }, (_, i) => i);

    const formatHour = (hour: number) => {
        if (hour === 0) return '12 AM';
        if (hour === 12) return '12 PM';
        if (hour < 12) return `${hour} AM`;
        return `${hour - 12} PM`;
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 overflow-hidden">
            {/* Header with stats */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                            {t('analytics.busiestHours') || 'Busiest Hours'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('analytics.heatmapDescription') || 'Order frequency by day & hour'}
                        </p>
                    </div>
                </div>

                {totalOrders > 0 && (
                    <div className="flex items-center gap-3 text-sm bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-700">
                        <span className="text-slate-500 dark:text-slate-400">Peak:</span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {dayNames[peakData.day].short} {formatHour(peakData.hour)}
                        </span>
                    </div>
                )}
            </div>

            {orders.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
                    <Clock className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        No order data yet
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <div className="min-w-[600px] pb-2">
                        {/* Time labels (Top X-Axis) */}
                        <div className="flex mb-2">
                            <div className="w-12 shrink-0"></div> {/* Spacer for Day labels */}
                            <div className="flex-1 grid grid-cols-24 gap-1">
                                {hours.map((hour) => (
                                    <div key={hour} className="text-center relative h-6">
                                        {/* Show label every 6 hours to reduce clutter, centered logic */}
                                        {(hour % 6 === 0) && (
                                            <span className="absolute left-1/2 -translate-x-1/2 text-[10px] font-medium text-slate-400 uppercase tracking-tight">
                                                {hour === 0 ? '12a' : hour === 12 ? '12p' : hour < 12 ? `${hour}a` : `${hour - 12}p`}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Heatmap Grid */}
                        <div className="space-y-1">
                            {dayNames.map((day, dayIndex) => (
                                <div key={dayIndex} className="flex items-center">
                                    {/* Y-Axis: Days */}
                                    <div className="w-12 shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                        {day.short}
                                    </div>

                                    {/* Row of Cells */}
                                    <div className="flex-1 grid grid-cols-24 gap-1">
                                        {hours.map((hour) => {
                                            const dataPoint = heatmapData.find(
                                                (d) => d.day === dayIndex && d.hour === hour
                                            );
                                            const count = dataPoint?.count || 0;
                                            const isPeak = count === maxCount && count > 0;

                                            return (
                                                <div
                                                    key={hour}
                                                    className={`
                                                        relative h-7 rounded-sm transition-all duration-200 group/cell
                                                        ${getColorClasses(count)}
                                                        ${count > 0 ? 'hover:scale-110 hover:shadow-md hover:z-10 hover:border-emerald-500 dark:hover:border-emerald-400 cursor-pointer' : ''}
                                                    `}
                                                    title={`${day.full}, ${formatHour(hour)}: ${count} orders`}
                                                >
                                                    {/* Tooltip */}
                                                    <div className="absolute invisible group-hover/cell:visible bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
                                                        <div className="bg-slate-900 text-white text-[11px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                                                            <div className="font-medium">{day.short} {formatHour(hour)}</div>
                                                            <div className="text-slate-300">{count} orders</div>
                                                        </div>
                                                        {/* Arrow */}
                                                        <div className="w-2 h-2 bg-slate-900 rotate-45 mx-auto -mt-1"></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Legend */}
                        <div className="flex items-center justify-end mt-4 gap-2 mr-1">
                            <span className="text-[10px] text-slate-400">Less</span>
                            <div className="flex gap-1">
                                {[0, 0.2, 0.4, 0.6, 0.8].map((level, i) => (
                                    <div
                                        key={i}
                                        className={`w-3 h-3 rounded-sm ${getColorClasses(level === 0 ? 0 : Math.ceil(maxCount * level))}`}
                                    />
                                ))}
                            </div>
                            <span className="text-[10px] text-slate-400">More</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HourlyHeatmap;
