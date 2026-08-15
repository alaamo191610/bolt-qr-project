import { Prisma } from '@prisma/client';

export const ANALYTICS_DEFAULT_DAYS = 30;
export const ANALYTICS_MAX_DAYS = 90;

export class AnalyticsRangeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AnalyticsRangeError';
    this.status = 400;
    this.code = 'INVALID_ANALYTICS_RANGE';
  }
}

export const resolveAnalyticsRange = (query, clock = () => new Date()) => {
  const rawDays = query.days == null || query.days === '' ? ANALYTICS_DEFAULT_DAYS : String(query.days);
  if (!/^\d+$/u.test(rawDays)) throw new AnalyticsRangeError('Analytics days must be an integer');
  const days = Number(rawDays);
  if (!Number.isSafeInteger(days) || days < 1 || days > ANALYTICS_MAX_DAYS) {
    throw new AnalyticsRangeError(`Analytics days must be between 1 and ${ANALYTICS_MAX_DAYS}`);
  }
  const end = new Date(clock());
  if (Number.isNaN(end.getTime())) throw new Error('Analytics clock returned an invalid date');
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1_000);
  return Object.freeze({ days, start, end, timezone: 'UTC' });
};

const emptyAnalytics = {
  totals: { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0, servedOrders: 0 },
  popularItems: [],
  topTables: [],
  statusData: [],
  dailyTrend: [],
  hourlyActivity: [],
};

const normalizeAnalytics = value => {
  const analytics = value && typeof value === 'object' ? value : emptyAnalytics;
  const statusData = Array.isArray(analytics.statusData) ? analytics.statusData : [];
  return {
    totals: {
      totalRevenue: Number(analytics.totals?.totalRevenue) || 0,
      totalOrders: Number(analytics.totals?.totalOrders) || 0,
      averageOrderValue: Number(analytics.totals?.averageOrderValue) || 0,
      servedOrders: Number(analytics.totals?.servedOrders) || 0,
    },
    popularItems: Array.isArray(analytics.popularItems) ? analytics.popularItems : [],
    topTables: Array.isArray(analytics.topTables) ? analytics.topTables : [],
    statusData,
    revenueByStatus: Object.fromEntries(statusData.map(item => [item.status, Number(item.revenue) || 0])),
    dailyTrend: Array.isArray(analytics.dailyTrend) ? analytics.dailyTrend : [],
    hourlyActivity: Array.isArray(analytics.hourlyActivity) ? analytics.hourlyActivity : [],
  };
};

export const createAnalyticsService = ({ database, clock = () => new Date() }) => ({
  async summarize({ organizationId, query = {} }) {
    const range = resolveAnalyticsRange(query, clock);
    const rows = await database.$queryRaw(Prisma.sql`
      WITH scoped_orders AS MATERIALIZED (
        SELECT id, status, total, table_id, created_at
        FROM orders
        WHERE organization_id = ${organizationId}::uuid
          AND created_at >= ${range.start}
          AND created_at < ${range.end}
      ),
      totals AS (
        SELECT
          COALESCE(SUM(total), 0)::double precision AS total_revenue,
          COUNT(*)::integer AS total_orders,
          COALESCE(AVG(total), 0)::double precision AS average_order_value,
          COUNT(*) FILTER (WHERE status = 'served')::integer AS served_orders
        FROM scoped_orders
      ),
      status_summary AS (
        SELECT
          COALESCE(status, 'unknown') AS status,
          COUNT(*)::integer AS count,
          COALESCE(SUM(total), 0)::double precision AS revenue
        FROM scoped_orders
        GROUP BY COALESCE(status, 'unknown')
      ),
      table_summary AS (
        SELECT
          COALESCE(t.code, so.table_id::text, 'unassigned') AS "table",
          COUNT(*)::integer AS count,
          COALESCE(SUM(so.total), 0)::double precision AS revenue
        FROM scoped_orders so
        LEFT JOIN tables t ON t.id = so.table_id
        GROUP BY COALESCE(t.code, so.table_id::text, 'unassigned')
        ORDER BY count DESC, "table" ASC
        LIMIT 5
      ),
      item_summary AS (
        SELECT
          oi.menu_id AS id,
          COALESCE(m.name_en, 'Unknown Item') AS name_en,
          m.name_ar AS name_ar,
          COALESCE(SUM(oi.quantity), 0)::integer AS count,
          COALESCE(SUM(oi.price_at_order * oi.quantity), 0)::double precision AS revenue
        FROM scoped_orders so
        JOIN order_items oi ON oi.order_id = so.id AND oi.status = 'ACTIVE'
        LEFT JOIN menus m ON m.id = oi.menu_id
        GROUP BY oi.menu_id, m.name_en, m.name_ar
        ORDER BY count DESC, id ASC NULLS LAST
        LIMIT 5
      ),
      day_series AS (
        SELECT generate_series(
          date_trunc('day', ${range.end}::timestamptz) - interval '6 days',
          date_trunc('day', ${range.end}::timestamptz),
          interval '1 day'
        ) AS day
      ),
      daily_summary AS (
        SELECT
          to_char(ds.day AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
          COUNT(so.id)::integer AS orders,
          COALESCE(SUM(so.total), 0)::double precision AS revenue
        FROM day_series ds
        LEFT JOIN scoped_orders so ON so.created_at >= ds.day AND so.created_at < ds.day + interval '1 day'
        GROUP BY ds.day
        ORDER BY ds.day ASC
      ),
      hourly_summary AS (
        SELECT
          EXTRACT(DOW FROM created_at AT TIME ZONE 'UTC')::integer AS day,
          EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::integer AS hour,
          COUNT(*)::integer AS count
        FROM scoped_orders
        GROUP BY 1, 2
        ORDER BY count DESC, day ASC, hour ASC
        LIMIT 4
      )
      SELECT jsonb_build_object(
        'totals', (SELECT jsonb_build_object(
          'totalRevenue', total_revenue,
          'totalOrders', total_orders,
          'averageOrderValue', average_order_value,
          'servedOrders', served_orders
        ) FROM totals),
        'statusData', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'status', status, 'count', count, 'revenue', revenue
        ) ORDER BY status) FROM status_summary), '[]'::jsonb),
        'topTables', COALESCE((SELECT jsonb_agg(to_jsonb(table_summary) ORDER BY count DESC, "table" ASC)
          FROM table_summary), '[]'::jsonb),
        'popularItems', COALESCE((SELECT jsonb_agg(to_jsonb(item_summary) ORDER BY count DESC, id ASC NULLS LAST)
          FROM item_summary), '[]'::jsonb),
        'dailyTrend', COALESCE((SELECT jsonb_agg(to_jsonb(daily_summary) ORDER BY date ASC)
          FROM daily_summary), '[]'::jsonb),
        'hourlyActivity', COALESCE((SELECT jsonb_agg(to_jsonb(hourly_summary) ORDER BY count DESC, day ASC, hour ASC)
          FROM hourly_summary), '[]'::jsonb)
      ) AS analytics
    `);
    return {
      range: {
        days: range.days,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        timezone: range.timezone,
      },
      ...normalizeAnalytics(rows[0]?.analytics),
    };
  },
});
