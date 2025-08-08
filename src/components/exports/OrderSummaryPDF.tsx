import React from 'react';
import type { Order } from '../../lib/supabase';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

interface OrderWithItems extends Order {
  items: { name: string; quantity: number; price?: number }[];
}

interface Props {
  orders: OrderWithItems[];
  t: (key: string) => string;
  language: 'en' | 'ar';
  dateRange?: string;
}

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 12 },
  headerBar: { backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 20, marginBottom: 16 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: 700 as any },
  headerSub: { color: '#dbeafe', fontSize: 10 },

  section: { marginBottom: 20 },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 },

  // KPI Cards
  kpiRow: { flexDirection: 'row', marginBottom: 12 },
  kpiCard: {
    flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb',
    borderRadius: 8, padding: 10,
  },
  kpiCardMid: { marginHorizontal: 8 },
  kpiLabel: { fontSize: 10, color: '#64748b', marginBottom: 4 },
  kpiValue: { fontSize: 16, fontWeight: 700 as any, color: '#0f172a' },

  // Grouped-by-table "table"
  tableHeaderRow: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 6 },
  thCell: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, fontWeight: 700 as any, color: '#374151' },
  thNarrow: { flexBasis: 90, flexGrow: 0 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb' },
  tdCell: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, color: '#111827' },
  tdNarrow: { flexBasis: 90, flexGrow: 0 },

  // Order card
  orderBox: {
    padding: 10,
    borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb',
    borderRadius: 8, marginBottom: 10, backgroundColor: '#f9fafb',
  },
  orderHeaderRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 6 },
  orderLine: { marginBottom: 2 },
  bold: { fontWeight: 700 as any },
  muted: { color: '#6b7280' },

  // Status badge
  badge: {
    fontSize: 10, color: '#ffffff', borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6,
    marginLeft: 8, marginRight: 8,
  },
  badge_pending:   { backgroundColor: '#f59e0b' },
  badge_preparing: { backgroundColor: '#3b82f6' },
  badge_completed: { backgroundColor: '#10b981' },
  badge_served:    { backgroundColor: '#22c55e' },
  badge_cancelled: { backgroundColor: '#ef4444' },

  itemsBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb',
    borderRadius: 6, marginTop: 6,
  },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 6 },
  itemRowAlt: { backgroundColor: '#f3f4f6' },
  itemName: { fontSize: 11, color: '#111827' },
  itemMeta: { fontSize: 11, color: '#111827' },

  summaryRow: { fontSize: 13, fontWeight: 700 as any, marginTop: 6, color: '#1f2937' },

  footer: { position: 'absolute', bottom: 16, left: 24, right: 24, textAlign: 'center', fontSize: 10, color: '#6b7280' },
});

const OrderSummaryPDF: React.FC<Props> = ({ orders, t, language, dateRange }) => {
  // Locale & formatters
  const locale = language === 'ar' ? 'ar-QA' : 'en-QA';
  const moneyFmt  = new Intl.NumberFormat(locale, { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 });
  const numberFmt = new Intl.NumberFormat(locale);
  const dateFmt   = (iso: string) =>
    new Date(iso).toLocaleString(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const dirStyle = { textAlign: language === 'ar' ? 'right' : 'left' } as const;

  // Core numbers
  const totalRevenue  = orders.reduce((sum, o) => sum + (o.total ?? 0), 0);
  const avgOrderValue = orders.length ? totalRevenue / orders.length : 0;

  // Grouping
  const ordersByTable = orders.reduce((acc, order) => {
    const key = String(order.table_id);
    (acc[key] ||= []).push(order);
    return acc;
  }, {} as Record<string, OrderWithItems[]>);

  // Sort tables by revenue (nicer presentation; same logic)
  const tablesSorted = Object.entries(ordersByTable)
    .map(([tableId, arr]) => {
      const subtotal = arr.reduce((s, o) => s + (o.total ?? 0), 0);
      return { tableId, orders: arr, subtotal };
    })
    .sort((a, b) => b.subtotal - a.subtotal);

  const statusBadgeStyle = (status?: string) => {
    const s = (status || 'pending').toLowerCase();
    switch (s) {
      case 'preparing': return [styles.badge, styles.badge_preparing];
      case 'completed': return [styles.badge, styles.badge_completed];
      case 'served':    return [styles.badge, styles.badge_served];
      case 'cancelled': return [styles.badge, styles.badge_cancelled];
      default:          return [styles.badge, styles.badge_pending];
    }
  };

  const groupItems = (items: { name: string; quantity: number; price?: number }[]) => {
    const map = new Map<string, { quantity: number; price?: number }>();
    for (const it of items || []) {
      const prev = map.get(it.name);
      map.set(it.name, { quantity: (prev?.quantity ?? 0) + (it.quantity ?? 0), price: it.price ?? prev?.price });
    }
    return Array.from(map.entries()).map(([name, v]) => ({ name, quantity: v.quantity, price: v.price }));
  };

  return (
    <Document>
      {/* === Summary Page === */}
      <Page size="A4" style={[styles.page, dirStyle]}>
        <View style={styles.headerBar}>
          <View style={styles.headerTopRow}>
            <Text style={styles.headerTitle}>{t('analytics.orderTitle')}</Text>
            {dateRange ? <Text style={styles.headerSub}>{t('common.dateRange')}: {dateRange}</Text> : null}
          </View>
        </View>

        {/* KPI Row */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{t('analytics.totalRevenue')}</Text>
            <Text style={styles.kpiValue}>{moneyFmt.format(totalRevenue)}</Text>
          </View>
          <View style={[styles.kpiCard, styles.kpiCardMid]}>
            <Text style={styles.kpiLabel}>{t('analytics.totalOrders')}</Text>
            <Text style={styles.kpiValue}>{numberFmt.format(orders.length)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{t('analytics.avgOrderValue')}</Text>
            <Text style={styles.kpiValue}>{moneyFmt.format(avgOrderValue)}</Text>
          </View>
        </View>

        {/* Grouped by Table */}
        <View style={styles.section}>
          <Text style={{ fontSize: 14, fontWeight: 700 as any, color: '#0f172a', marginBottom: 6 }}>
            {t('analytics.groupedByTable')}
          </Text>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.thCell]}>{t('common.table')}</Text>
            <Text style={[styles.thCell, styles.thNarrow]}>{t('analytics.orders')}</Text>
            <Text style={[styles.thCell, styles.thNarrow]}>{t('analytics.totalRevenue')}</Text>
          </View>
          {tablesSorted.map(({ tableId, orders: tableOrders, subtotal }, idx) => (
            <View key={tableId} style={[styles.tableRow, { backgroundColor: idx % 2 ? '#ffffff' : '#f9fafb' }]}>
              <Text style={[styles.tdCell]}>{tableId}</Text>
              <Text style={[styles.tdCell, styles.tdNarrow]}>{numberFmt.format(tableOrders.length)}</Text>
              <Text style={[styles.tdCell, styles.tdNarrow]}>{moneyFmt.format(subtotal)}</Text>
            </View>
          ))}
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `${numberFmt.format(pageNumber)} / ${numberFmt.format(totalPages)}`}
          fixed
        />
      </Page>

      {/* === One Page Per Table === */}
      {tablesSorted.map(({ tableId, orders: tableOrders, subtotal }) => (
        <Page key={tableId} size="A4" style={[styles.page, dirStyle]}>
          <View style={styles.headerBar}>
            <View style={styles.headerTopRow}>
              <Text style={styles.headerTitle}>{t('common.table')} {tableId}</Text>
              <Text style={styles.headerSub}>
                {numberFmt.format(tableOrders.length)} {t('analytics.orders')} • {moneyFmt.format(subtotal)}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            {tableOrders.map((order) => {
              const grouped = groupItems(order.items ?? []);
              const statusKey = `analytics.status.${order.status ?? 'pending'}`;
              return (
                <View key={order.id} style={styles.orderBox} wrap={false}>
                  {/* Order header line */}
                  <View style={styles.orderHeaderRow}>
                    <Text style={[styles.bold]}>{t('orders.orderNumber')}: {order.order_number ?? order.id}</Text>
                    <Text style={[...statusBadgeStyle(String(order.status))]}>{t(statusKey)}</Text>
                    <Text style={[styles.bold]}>{moneyFmt.format(order.total ?? 0)}</Text>
                    <Text style={[styles.muted, { marginLeft: 8 }]}>{dateFmt(order.created_at)}</Text>
                  </View>

                  {/* Items */}
                  {!!grouped.length && (
                    <View>
                      <Text style={{ marginBottom: 4 }}>{t('orders.items')}:</Text>
                      <View style={styles.itemsBox}>
                        {grouped.map((it, i) => {
                          const unit = it.price ?? 0;
                          const line = unit * (it.quantity ?? 0);
                          return (
                            <View
                              key={`${it.name}-${i}`}
                              style={[styles.itemRow, ...(i % 2 ? [styles.itemRowAlt] : [])]}
                            >
                              <Text style={styles.itemName}>• {it.name}</Text>
                              <Text style={styles.itemMeta}>
                                {numberFmt.format(it.quantity)} × {moneyFmt.format(unit)} = {moneyFmt.format(line)}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.summaryRow}>
            <Text>{t('analytics.tableSubtotal')}: {moneyFmt.format(subtotal)}</Text>
          </View>

          <Text
            style={styles.footer}
            render={({ pageNumber, totalPages }) => `${numberFmt.format(pageNumber)} / ${numberFmt.format(totalPages)}`}
            fixed
          />
        </Page>
      ))}
    </Document>
  );
};

export default OrderSummaryPDF;