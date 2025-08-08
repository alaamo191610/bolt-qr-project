import { supabase } from '../lib/supabase'

// ---------- Types used by Analytics (optional export) ----------
export interface AnalyticsOrderItem {
  id?: string
  name?: string        // fallback (legacy)
  name_en?: string
  name_ar?: string
  price: number
  quantity: number
}

export interface AnalyticsOrder {
  id: string
  tableNumber: string
  status: string
  total: number
  timestamp: Date
  items: AnalyticsOrderItem[]
}

export const orderService = {
  // Create new order with items
  async createOrder(orderData: {
    table_code: string
    items: Array<{
      menu_item_id: string
      quantity: number
      price_at_order: number
      note?: string
    }>
    note?: string
    admin_id?: string
  }) {
    try {
      // 1) Find table by code
      const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('id, admin_id')
        .eq('code', orderData.table_code)
        .single()
      if (tableError) throw tableError

      // 2) Calculate total
      const total = orderData.items.reduce(
        (sum, item) => sum + item.price_at_order * item.quantity,
        0
      )

      // 3) Next order number for this admin
      const { data: lastOrder } = await supabase
        .from('orders')
        .select('order_number')
        .eq('admin_id', tableData.admin_id)
        .order('order_number', { ascending: false })
        .limit(1)

      const nextOrderNumber = (lastOrder?.[0]?.order_number || 0) + 1

      // 4) Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([
          {
            // ✅ IMPORTANT: save the actual table ID, not the code
            table_id: tableData.id,
            status: 'pending',
            total,
            note: orderData.note,
            admin_id: tableData.admin_id,
            order_number: nextOrderNumber,
            user_id: crypto.randomUUID(),
          },
        ])
        .select()
        .single()
      if (orderError) throw orderError

      // 5) Create order items
      const orderItems = orderData.items.map((item) => ({
        order_id: order.id,
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        price_at_order: item.price_at_order,
        note: item.note,
      }))

      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems)
        .select()
      if (itemsError) throw itemsError

      return { order, items }
    } catch (error) {
      console.error('Error creating order:', error)
      throw error
    }
  },

  // Get orders for admin (raw, with nested menus; keep existing)
  async getOrders(adminId: string, status?: string) {
    try {
      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            menus ( id, name_en, name_ar, price )
          )
        `)
        .eq('admin_id', adminId)
        .order('created_at', { ascending: false })

      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching orders:', error)
      throw error
    }
  },

  // ✅ NEW: Cleaned, mapped shape for Analytics (with AR/EN names)
  async getOrdersForAnalytics(adminId: string): Promise<AnalyticsOrder[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, table_id, status, total, created_at,
        order_items (
          id, quantity, price_at_order, created_at,
          menus ( id, name_en, name_ar )
        )
      `)
      .eq('admin_id', adminId)
      .order('created_at', { ascending: false })

    // If your PostgREST needs an explicit relation alias, use:
    // .select(`
    //   id, table_id, status, total, created_at,
    //   order_items (
    //     id, quantity, price_at_order, created_at,
    //     menu:menu_item_id ( id, name_en, name_ar )  -- alias via FK column
    //   )
    // `)

    if (error) throw error

    return (data ?? []).map((o: any) => ({
      id: o.id,
      tableNumber: o.table_id, // if you want the table *code*, join tables here
      status: o.status ?? 'pending',
      total: o.total ?? 0,
      timestamp: new Date(o.created_at),
      items: (o.order_items ?? []).map((oi: any) => {
        const m = oi.menus ?? oi.menu // support both alias forms
        return {
          id: m?.id,
          name_en: m?.name_en ?? undefined,
          name_ar: m?.name_ar ?? undefined,
          name: m?.name_en ?? undefined, // legacy fallback
          price: oi.price_at_order,
          quantity: oi.quantity,
        } as AnalyticsOrderItem
      }),
    }))
  },

  // Update order status
  async updateOrderStatus(orderId: string, status: string) {
    try {
      const updates: any = {
        status,
        status_updated_at: new Date().toISOString(),
      }
      if (status === 'preparing') updates.preparing_at = new Date().toISOString()
      else if (status === 'completed') updates.completed_at = new Date().toISOString()
      else if (status === 'cancelled') updates.cancelled_at = new Date().toISOString()

      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId)
        .select()
        .single()
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error updating order status:', error)
      throw error
    }
  },

  // Get order by ID (raw)
  async getOrderById(orderId: string) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            menus ( id, name_en, name_ar, price, image_url )
          )
        `)
        .eq('id', orderId)
        .single()
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching order:', error)
      throw error
    }
  },
}