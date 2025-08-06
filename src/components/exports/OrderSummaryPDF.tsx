import React from 'react';
import type { Order } from '../../lib/supabase';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';

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
  page: {
    padding: 24,
    fontSize: 12,
  },
  headerBar: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 20,
    marginBottom: 12,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 4,
    color: '#6b7280',
  },
  section: {
    marginBottom: 20,
  },
  tableHeader: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: 'bold',
    color: '#10b981',
  },
  orderBox: {
    padding: 10,
    border: '1 solid #e5e7eb',
    borderRadius: 6,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
  },
  orderText: {
    marginBottom: 2,
  },
  itemText: {
    marginLeft: 8,
    fontSize: 11,
    marginBottom: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },
  bold: {
    fontWeight: 'bold',
  },
  summaryRow: {
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 6,
    color: '#1f2937',
  },
  itemListBox: {
    backgroundColor: '#f9fafb',
    padding: 6,
    borderRadius: 6,
    marginTop: 4,
    border: '1 solid #e5e7eb',
    boxShadow: '1px 1px 3px rgba(0,0,0,0.1)', // works visually but not officially supported by react-pdf
  },

});

const OrderSummaryPDF: React.FC<Props> = ({ orders, t, language, dateRange }) => {
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total ?? 0), 0);
  const avgOrderValue = orders.length ? totalRevenue / orders.length : 0;

  const ordersByTable = orders.reduce((acc, order) => {
    if (!acc[order.table_id]) acc[order.table_id] = [];
    acc[order.table_id].push(order);
    return acc;
  }, {} as Record<string, OrderWithItems[]>);

  const localized = (date: string) =>
    new Date(date).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US');
  function groupItems(items: { name: string; quantity: number; price?: number }[]) {
    const map = new Map<string, { quantity: number; price?: number }>();

    for (const item of items) {
      const existing = map.get(item.name);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        map.set(item.name, { quantity: item.quantity, price: item.price });
      }
    }

    return Array.from(map.entries()).map(([name, { quantity, price }]) => ({
      name,
      quantity,
      price,
    }));
  }


  return (
    <Document>
      {/* Overall Summary Page */}
      <Page size="A4" style={{ ...styles.page, direction: language === 'ar' ? 'rtl' : 'ltr' }}>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>{t('analytics.orderTitle')}</Text>
        </View>

        <View style={styles.section}>
          {dateRange && <Text style={styles.subtitle}>{t('common.dateRange')}: {dateRange}</Text>}
          <Text style={styles.subtitle}>{t('analytics.totalRevenue')}: <Text style={styles.bold}>${totalRevenue.toFixed(2)}</Text></Text>
          <Text style={styles.subtitle}>{t('analytics.totalOrders')}: <Text style={styles.bold}>{orders.length}</Text></Text>
          <Text style={styles.subtitle}>{t('analytics.avgOrderValue')}: <Text style={styles.bold}>${avgOrderValue.toFixed(2)}</Text></Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.tableHeader}>{t('analytics.groupedByTable')}</Text>
          <View style={styles.divider} />
          {Object.entries(ordersByTable).map(([tableId, tableOrders]) => {
            const subtotal = tableOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);
            return (
              <View key={tableId} style={{ marginBottom: 8 }}>
                <Text>{t('common.table')} {tableId}: {tableOrders.length} {t('analytics.orders')} – ${subtotal.toFixed(2)}</Text>
              </View>
            );
          })}
        </View>
      </Page>

      {/* One Page Per Table */}
      {Object.entries(ordersByTable).map(([tableId, tableOrders]) => {
        const subtotal = tableOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);
        return (
          <Page key={tableId} size="A4" style={{ ...styles.page, direction: language === 'ar' ? 'rtl' : 'ltr' }}>
            <View style={styles.headerBar}>
              <Text style={styles.headerTitle}>{t('common.table')} {tableId}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.subtitle}>{tableOrders.length} {t('analytics.orders')} | {t('analytics.totalRevenue')}: ${subtotal.toFixed(2)}</Text>
            </View>

            <View style={styles.section}>
              {tableOrders.map(order => (
                <View key={order.id} style={styles.orderBox}>
                  <Text style={styles.orderText}>{t('orders.orderNumber')}: {order.order_number ?? order.id}</Text>
                  <Text style={styles.orderText}>{t('common.status')}: {order.status}</Text>
                  <Text style={styles.orderText}>{t('common.total')}: ${order.total?.toFixed(2) ?? '-'}</Text>
                  <Text style={styles.orderText}>{t('common.timestamp')}: {localized(order.created_at)}</Text>

                  {order.items?.length > 0 && (
                    <View>
                      <Text>{t('orders.items')}:</Text>
                      <View style={styles.itemListBox}>
                        {(() => {
                          const grouped = groupItems(order.items);
                          return (
                            <>
                              {grouped.map((item, idx) => {
                                const unit = item.price ?? 0;
                                const total = (unit * item.quantity).toFixed(2);
                                return (
                                  <View
                                    key={idx}
                                    style={{
                                      backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f3f4f6',
                                      paddingVertical: 2,
                                      paddingHorizontal: 4,
                                      borderRadius: 4,
                                    }}
                                  >
                                    <Text style={styles.itemText}>
                                      • {item.name}
                                      {item.price !== undefined && (
                                        <Text>
                                          {' '}(${unit.toFixed(2)}) × {item.quantity} — 💵 ${total}
                                        </Text>
                                      )}
                                    </Text>
                                  </View>
                                );
                              })}

                              {/* Item Subtotal Row
                              <View
                                style={{
                                  marginTop: 6,
                                  borderTop: '1 solid #d1d5db',
                                  paddingTop: 4,
                                }}
                              >
                                <Text style={{ ...styles.itemText, fontWeight: 'bold' }}>
                                  {t('common.total')}: ${subtotal.toFixed(2)}
                                </Text>
                              </View> */}
                            </>
                          );
                        })()}
                      </View>
                    </View>
                  )}

                </View>
              ))}
            </View>

            <View style={styles.summaryRow}>
            <Text>{t('analytics.tableSubtotal')}: ${subtotal.toFixed(2)}</Text>
            </View>
          </Page>
        );
      })}
    </Document>
  );
};

export default OrderSummaryPDF;