// orderService.ts
import { api } from './api'

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
    note?: string        // if you want this saved on orders, add handling in the Edge Function
    admin_id?: string
  }) {
    try {
      // Build function payload items
      const items = (orderData.items || []).map((it) => {
        // keep your nice kitchen note text
        const extrasNote = formatIngredientChoices(it.custom_ingredients ?? [], it.ingredient_names_map)
        const mergedNote = mergeNotes(it.note, extrasNote)

        // map tri-state ingredients -> picks for the function
        const ingredients =
          (it.custom_ingredients ?? []).map((c) => {
            if (c.action === 'no') return [{ ingredientId: c.id, action: 'remove' as const }]
            if (c.action === 'extra') return [{ ingredientId: c.id, action: 'extra' as const, qty: 1 }]
            return []
          })

        // if you later add modifier options to CreateOrderItemInput, map them here:
        // const options = (it.modifier_options ?? []).map((o: any) => ({
        //   optionId: o.option_id ?? o.id, qty: o.qty ?? 1
        // }))

        // if you later add combo children, map them here:
        // const comboChildren = (it.combo_children ?? []).map((c: any) => ({
        //   childMenuId: c.child_menu_id ?? c.menu_item_id,
        //   ingredients: (c.custom_ingredients ?? []).flatMap((x: any) =>
        //     x.action === 'no' ? [{ ingredientId: x.id, action: 'remove' as const }] :
        //     x.action === 'extra' ? [{ ingredientId: x.id, action: 'extra' as const, qty: 1 }] : []
        //   ),
        //   options: (c.modifier_options ?? []).map((o: any) => ({ optionId: o.option_id ?? o.id, qty: o.qty ?? 1 })),
        //   notes: c.note
        // }))

        return {
          menuId: it.menu_item_id,
          quantity: it.quantity ?? 1,
          notes: mergedNote || undefined,
          ingredients,
          // options,
          // comboChildren,
        }
      })

      // Call Backend API instead of Edge Function
      return await api.post('/orders', {
        tableCode: orderData.table_code,
        adminId: orderData.admin_id,
        items,
      });
    } catch (error: any) {
      console.error('invoke failed:', error?.message, error?.context);
      throw error
    }
  },

  // Get orders for admin (raw, with nested menus; unchanged columns)
  async getOrders(adminId: string, status?: string) {
    try {
      const params: Record<string, string> = { adminId };
      if (status) params.status = status;
      const orders = await api.get('/orders', params);
      return (orders || []).map((o: any) => ({
        ...o,
        total: Number(o.total) || 0,
        order_items: (o.order_items || []).map((oi: any) => ({
          ...oi,
          price_at_order: Number(oi.price_at_order) || 0,
          menus: oi.menus ? { ...oi.menus, price: Number(oi.menus.price) || 0 } : null
        }))
      }));
    } catch (error) {
      console.error('Error fetching orders:', error)
      throw error
    }
  },

  // Cleaned, mapped shape for Analytics (unit price already includes extras)
  async getOrdersForAnalytics(adminId: string): Promise<AnalyticsOrder[]> {
    // Reuse the getOrders API or create a specific analytics endpoint
    const data = await api.get('/orders', { adminId });
    return (data ?? []).map((o: any) => ({
      id: o.id,
      tableNumber: o.table_id, // join tables for code if you want the code instead of id
      status: o.status ?? 'pending',
      total: Number(o.total) || 0,
      timestamp: new Date(o.created_at),
      items: (o.order_items ?? []).map((oi: any) => {
        const m = oi.menus
        return {
          id: m?.id,
          name_en: m?.name_en ?? undefined,
          name_ar: m?.name_ar ?? undefined,
          name: m?.name_en ?? undefined, // legacy fallback
          price: Number(oi.price_at_order) || 0, // ✅ already includes any extras
          quantity: oi.quantity,
        } as AnalyticsOrderItem
      }),
    }))
  },

  // Update order status (same behavior)
  async updateOrderStatus(orderId: string, status: string) {
    try {
      // Implement PUT /api/orders/:id/status in backend
      return await api.put(`/orders/${orderId}/status`, { status });
    } catch (error) {
      console.error('Error updating order status:', error)
      throw error
    }
  },

  // Get order by ID (raw)
  async getOrderById(orderId: string) {
    try {
      return await api.get(`/orders/${orderId}`);
    } catch (error) {
      console.error('Error fetching order:', error)
      throw error
    }
  },
}