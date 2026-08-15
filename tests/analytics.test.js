import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYTICS_DEFAULT_DAYS,
  ANALYTICS_MAX_DAYS,
  AnalyticsRangeError,
  createAnalyticsService,
  resolveAnalyticsRange,
} from '../server/analytics.js';

const now = new Date('2026-08-16T12:00:00.000Z');

test('analytics range defaults to 30 UTC days and enforces the 90-day bound', () => {
  const range = resolveAnalyticsRange({}, () => now);
  assert.equal(range.days, ANALYTICS_DEFAULT_DAYS);
  assert.equal(range.end.toISOString(), now.toISOString());
  assert.equal(range.start.toISOString(), '2026-07-17T12:00:00.000Z');
  assert.equal(range.timezone, 'UTC');

  assert.equal(resolveAnalyticsRange({ days: String(ANALYTICS_MAX_DAYS) }, () => now).days, 90);
  for (const days of ['0', '91', '1.5', '-1', 'all']) {
    assert.throws(() => resolveAnalyticsRange({ days }, () => now), AnalyticsRangeError);
  }
});

test('analytics service returns normalized aggregate-only data', async () => {
  let querySeen = false;
  const service = createAnalyticsService({
    clock: () => now,
    database: {
      async $queryRaw(query) {
        querySeen = Boolean(query);
        return [{ analytics: {
          totals: { totalRevenue: '25.50', totalOrders: 2, averageOrderValue: '12.75', servedOrders: 1 },
          statusData: [{ status: 'served', count: 1, revenue: '10.00' }],
          popularItems: [{ id: 7, name_en: 'Tea', count: 2, revenue: 8 }],
          topTables: [{ table: 'A-01', count: 2, revenue: 25.5 }],
          dailyTrend: [{ date: '2026-08-16', orders: 2, revenue: 25.5 }],
          hourlyActivity: [{ day: 0, hour: 12, count: 2 }],
          note: 'must not be returned',
        } }];
      },
    },
  });

  const result = await service.summarize({
    organizationId: '00000000-0000-4000-8000-000000000001',
    query: { days: '7' },
  });
  assert.equal(querySeen, true);
  assert.equal(result.range.days, 7);
  assert.equal(result.totals.totalRevenue, 25.5);
  assert.deepEqual(result.revenueByStatus, { served: 10 });
  assert.equal('note' in result, false);
  assert.equal(JSON.stringify(result).includes('customization'), false);
});

test('analytics service returns stable empty aggregates', async () => {
  const service = createAnalyticsService({
    clock: () => now,
    database: { $queryRaw: async () => [{ analytics: null }] },
  });
  const result = await service.summarize({ organizationId: '00000000-0000-4000-8000-000000000001' });
  assert.deepEqual(result.totals, {
    totalRevenue: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    servedOrders: 0,
  });
  assert.deepEqual(result.popularItems, []);
});
