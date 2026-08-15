import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Analytics from './Analytics';
import type { AnalyticsSummary } from '../services/adminService';

vi.mock('../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    t: (key: string) => key,
    getLocalizedDayName: () => 'Sun',
  }),
}));
vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatPrice: (amount: number) => `$${amount.toFixed(2)}` }),
}));
vi.mock('../components/charts/OrderTrendChart', () => ({ default: () => null }));
vi.mock('../components/charts/StatusPieChart', () => ({ default: () => null }));
vi.mock('../components/charts/TopRevenueItemsChart', () => ({ default: () => null }));
vi.mock('../components/charts/TopTableRevenueChart', () => ({ default: () => null }));
vi.mock('../components/charts/HourlyHeatmap', () => ({ default: () => null }));

const summary: AnalyticsSummary = {
  range: { days: 30, start: '2026-07-17T12:00:00.000Z', end: '2026-08-16T12:00:00.000Z', timezone: 'UTC' },
  totals: { totalRevenue: 125.5, totalOrders: 4, averageOrderValue: 31.375, servedOrders: 3 },
  popularItems: [{ id: 1, name_en: 'Tea', name_ar: null, count: 3, revenue: 30 }],
  topTables: [{ table: 'A-01', count: 4, revenue: 125.5 }],
  statusData: [{ status: 'served', count: 3, revenue: 100 }],
  revenueByStatus: { served: 100 },
  dailyTrend: [{ date: '2026-08-16', orders: 4, revenue: 125.5 }],
  hourlyActivity: [{ day: 0, hour: 12, count: 4 }],
};

describe('bounded analytics presentation', () => {
  it('renders the server aggregate without requiring raw orders', async () => {
    render(<Analytics summary={summary} />);
    await act(async () => Promise.resolve());
    expect(screen.getAllByText('$125.50')).not.toHaveLength(0);
    expect(await screen.findByText(/Tea/)).toBeInTheDocument();
    expect(screen.getByText(/UTC/)).toBeInTheDocument();
  });

  it('offers a retry when the bounded aggregate fails', async () => {
    const retry = vi.fn();
    render(<Analytics summary={null} error="Could not load analytics" onRetry={retry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
