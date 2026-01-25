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

    // Enhanced color system with gradients
    const getColorClasses = (count: number): string => {
        if (count === 0) return 'bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700';

        const intensity = count / maxCount;

        if (intensity >= 0.8) return 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-sm shadow-emerald-500/30';
        if (intensity >= 0.6) return 'bg-gradient-to-br from-emerald-400 to-green-500 shadow-sm shadow-emerald-400/20';
        if (intensity >= 0.4) return 'bg-gradient-to-br from-emerald-300 to-green-400';
        if (intensity >= 0.2) return 'bg-gradient-to-br from-emerald-200 to-green-300 dark:from-emerald-800/40 dark:to-green-700/40';
        return 'bg-gradient-to-br from-emerald-100 to-green-200 dark:from-emerald-900/20 dark:to-green-800/20';
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
        <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 sm:p-8 overflow-hidden">
            {/* Header with stats */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <div className="flex items-center space-x-2 mb-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                            <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                            {t('analytics.busiestHours') || 'Busiest Hours'}
                        </h3>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 ml-12">
                        {t('analytics.heatmapDescription') || 'Order patterns throughout the week'}
                    </p>
                </div>

                {totalOrders > 0 && (
                    <div className="hidden sm:flex flex-col items-end space-y-1">
                        <div className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                            <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                                Peak: {formatHour(peakData.hour)}
                            </span>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            {dayNames[peakData.day].short}
                        </span>
                    </div>
                )}
            </div>

            {orders.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-20 h-20 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="w-10 h-10 text-slate-400" />
                    </div>
                    <p className="text-lg font-medium text-slate-600 dark:text-slate-400 mb-1">
                        No order data yet
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-500">
                        The heatmap will show patterns once you have orders
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto -mx-2 px-2">
                    <div className="min-w-[700px]">
                        {/* Time labels */}
                        <div className="flex mb-3">
                            <div className="w-20"></div>
                            <div className="flex-1 grid grid-cols-24 gap-1.5">
                                {hours.map((hour) => (
                                    <div
                                        key={hour}
                                        className="text-center"
                                    >
                                        {hour % 6 === 0 && (
                                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                                {hour === 0 ? '12AM' : hour === 12 ? '12PM' : hour < 12 ? `${hour}AM` : `${hour - 12}PM`}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Heatmap grid */}
                        <div className="space-y-2">
                            {dayNames.map((day, dayIndex) => (
                                <div key={dayIndex} className="flex items-center group">
                                    <div className="w-20 text-sm font-semibold text-slate-700 dark:text-slate-300 pr-3">
                                        {day.short}
                                    </div>
                                    <div className="flex-1 grid grid-cols-24 gap-1.5">
                                        {hours.map((hour) => {
                                            const dataPoint = heatmapData.find(
                                                (d) => d.day === dayIndex && d.hour === hour
                                            );
                                            const count = dataPoint?.count || 0;
                                            const isPeak = count === maxCount && count > 0;

                                            return (
                                                <div
                                                    key={hour}
                                                    className={`h-10 rounded-lg transition-all duration-200 cursor-pointer group/cell relative ${getColorClasses(count)} ${count > 0 ? 'hover:scale-110 hover:shadow-lg hover:z-10' : 'hover:bg-slate-100 dark:hover:bg-slate-700'} ${isPeak ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}
                                                    title={`${day.full}, ${formatHour(hour)}`}
                                                >
                                                    {/* Tooltip */}
                                                    <div className="absolute invisible group-hover/cell:visible -top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                                                        <div className="bg-slate-900 dark:bg-slate-700 text-white px-3 py-2 rounded-lg shadow-xl">
                                                            <div className="text-xs font-medium whitespace-nowrap">
                                                                {day.short}, {formatHour(hour)}
                                                            </div>
                                                            <div className="text-sm font-bold text-emerald-400">
                                                                {count} {count === 1 ? 'order' : 'orders'}
                                                            </div>
                                                            {isPeak && <div className="text-xs text-yellow-400">🔥 Peak hour</div>}
                                                        </div>
                                                        <div className="w-2 h-2 bg-slate-900 dark:bg-slate-700 rotate-45 -mt-1 mx-auto"></div>
                                                    </div>

                                                    {/* Count indicator for high-volume cells */}
                                                    {count >= maxCount * 0.5 && count > 0 && (
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <span className="text-xs font-bold text-white drop-shadow-lg">
                                                                {count}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Legend */}
                        <div className="flex items-center justify-center mt-8 space-x-4 pt-6 border-t border-slate-200 dark:border-slate-700">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                                Activity Level:
                            </span>
                            <div className="flex items-center space-x-2">
                                <span className="text-xs text-slate-500 dark:text-slate-500">Low</span>
                                {[0, 0.2, 0.4, 0.6, 0.8, 1].map((level, idx) => (
                                    <div
                                        key={idx}
                                        className={`h-5 w-5 rounded ${getColorClasses(level === 0 ? 0 : Math.ceil(maxCount * level))}`}
                                    />
                                ))}
                                <span className="text-xs text-slate-500 dark:text-slate-500">High</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HourlyHeatmap;
