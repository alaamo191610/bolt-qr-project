import { supabase } from '../lib/supabase'
import type { Order, OrderItem } from '../lib/supabase'

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
      // Start a transaction-like operation
      const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('id, admin_id')
        .eq('code', orderData.table_code)
        .single()

      if (tableError) throw tableError

      // Calculate total
      const total = orderData.items.reduce((sum, item) => 
        sum + (item.price_at_order * item.quantity), 0
      )

      // Get next order number for this admin
      const { data: lastOrder } = await supabase
        .from('orders')
        .select('order_number')
        .eq('admin_id', tableData.admin_id)
        .order('order_number', { ascending: false })
        .limit(1)

      const nextOrderNumber = (lastOrder?.[0]?.order_number || 0) + 1

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([{
          table_id: orderData.table_code,
          status: 'pending',
          total,
          note: orderData.note,
          admin_id: tableData.admin_id,
          order_number: nextOrderNumber,
          user_id: crypto.randomUUID() // Generate a session user ID
        }])
        .select()
        .single()

      if (orderError) throw orderError

      // Create order items
      const orderItems = orderData.items.map(item => ({
        order_id: order.id,
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        price_at_order: item.price_at_order,
        note: item.note
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

  // Get orders for admin
  async getOrders(adminId: string, status?: string) {
    try {
      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            menus (
              name_en,
              name_ar,
              price
            )
          )
        `)
        .eq('admin_id', adminId)
        .order('created_at', { ascending: false })

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error } = await query

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching orders:', error)
      throw error
    }
  },

  // Update order status
  async updateOrderStatus(orderId: string, status: string) {
    try {
      const updates: any = {
        status,
        status_updated_at: new Date().toISOString()
      }

      // Set specific timestamps based on status
      if (status === 'preparing') {
        updates.preparing_at = new Date().toISOString()
      } else if (status === 'completed') {
        updates.completed_at = new Date().toISOString()
      } else if (status === 'cancelled') {
        updates.cancelled_at = new Date().toISOString()
      }

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

  // Get order by ID
  async getOrderById(orderId: string) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            menus (
              name_en,
              name_ar,
              price,
              image_url
            )
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
  }
}