// orderService.ts
import { supabase } from '../lib/supabase'

// ---------------- Types (kept compatible) ----------------
type IngredientAction = 'no' | 'normal' | 'extra'

/** One cart line going into createOrder */
export type CreateOrderItemInput = {
  menu_item_id: string
  quantity: number
  /** Base unit price at the time of order (no extras) */
  price_at_order: number
  /** Optional extras (per unit). We will *fold* this into price_at_order for storage */
  price_delta?: number
  /** Tri-state ingredient choices coming from your customize modal */
  custom_ingredients?: { id: string; action: IngredientAction }[]
  /** Optional legacy list like ["ing:<id>:extra"] — ignored here but supported if you need */
  selected_modifiers?: string[]
  /** Optional free text note from the UI for this line */
  note?: string
  /**
   * Optional map for pretty notes: ingredient id -> localized name
   * e.g., { "abc-123": "Onions", "def-456": "Cheese" } or Arabic equivalents
   */
  ingredient_names_map?: Record<string, string>
}

// ---------- Types used by Analytics (kept) ----------
export interface AnalyticsOrderItem {
  id?: string
  name?: string        // fallback (legacy)
  name_en?: string
  name_ar?: string
  /** unit price (already includes extras, because we fold them in) */
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

// ---------------- Helpers ----------------
function mergeNotes(a?: string, b?: string) {
  const A = (a ?? '').trim()
  const B = (b ?? '').trim()
  if (A && B) return `${A} | ${B}`
  return A || B || ''
}

function formatIngredientChoices(
  choices: { id: string; action: IngredientAction }[],
  names?: Record<string, string>
) {
  if (!choices?.length) return ''
  const noList: string[] = []
  const extraList: string[] = []

  for (const c of choices) {
    if (c.action === 'no') noList.push(names?.[c.id] || c.id)
    if (c.action === 'extra') extraList.push(names?.[c.id] || c.id)
  }

  const parts: string[] = []
  if (noList.length) parts.push(`no: ${noList.join(', ')}`)
  if (extraList.length) parts.push(`extra: ${extraList.join(', ')}`)
  return parts.join(' | ')
}

// ---------------- Service ----------------
export const orderService = {
  // Create new order with items — extras are *folded into* price_at_order (no schema change)
  async createOrder(orderData: {
    table_code: string
    items: CreateOrderItemInput[]
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

      // 2) Calculate order total = Σ ((base + extras) * qty)
      const total = orderData.items.reduce((sum, it) => {
        const unit = (it.price_at_order || 0) + (it.price_delta ?? 0)
        return sum + unit * (it.quantity || 0)
      }, 0)

      // 3) Next order number for this admin
      const { data: lastOrder } = await supabase
        .from('orders')
        .select('order_number')
        .eq('admin_id', tableData.admin_id)
        .order('order_number', { ascending: false })
        .limit(1)

      const nextOrderNumber = (lastOrder?.[0]?.order_number || 0) + 1

      // 4) Create order header
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([
          {
            table_id: tableData.id,        // save actual table id
            status: 'pending',
            total,
            note: orderData.note || null,
            admin_id: tableData.admin_id,
            order_number: nextOrderNumber,
            user_id: crypto.randomUUID(),
          },
        ])
        .select()
        .single()
      if (orderError) throw orderError

      // 5) Create order items
      const orderItems = orderData.items.map((it) => {
        const unitWithExtras = (it.price_at_order || 0) + (it.price_delta ?? 0)

        // Make a readable note so the kitchen sees choices (no onions | extra cheese)
        const extrasNote = formatIngredientChoices(
          it.custom_ingredients ?? [],
          it.ingredient_names_map
        )
        const mergedNote = mergeNotes(it.note, extrasNote)

        return {
          order_id: order.id,
          menu_item_id: it.menu_item_id,
          quantity: it.quantity,
          // ✅ We store the unit price INCLUDING extras (no schema change required)
          price_at_order: unitWithExtras,
          note: mergedNote || null,
        }
      })

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

  // Get orders for admin (raw, with nested menus; unchanged columns)
  async getOrders(adminId: string, status?: string) {
    try {
      let query = supabase
        .from('orders')
        .select(`
          id,
          order_number,
          total,
          status,
          created_at,
          table:tables ( id, code ),
          order_items (
            quantity,
            price_at_order,
            note,
            menus ( name_en, price )
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

  // Cleaned, mapped shape for Analytics (unit price already includes extras)
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

    if (error) throw error

    return (data ?? []).map((o: any) => ({
      id: o.id,
      tableNumber: o.table_id, // join tables for code if you want the code instead of id
      status: o.status ?? 'pending',
      total: o.total ?? 0,
      timestamp: new Date(o.created_at),
      items: (o.order_items ?? []).map((oi: any) => {
        const m = oi.menus
        return {
          id: m?.id,
          name_en: m?.name_en ?? undefined,
          name_ar: m?.name_ar ?? undefined,
          name: m?.name_en ?? undefined, // legacy fallback
          price: oi.price_at_order || 0, // ✅ already includes any extras
          quantity: oi.quantity,
        } as AnalyticsOrderItem
      }),
    }))
  },

  // Update order status (same behavior)
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