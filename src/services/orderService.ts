// orderService.ts
import { api, ApiError } from './api'
import { getErrorMessage } from '../utils/errors'
import type { Promotion } from '../pricing/types'

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
  checkout_payload?: {
    ingredients?: { ingredientId: string; action: 'remove' | 'extra'; qty?: number }[]
    options?: { optionId: string; qty?: number }[]
    comboChildren?: { groupId: string; childMenuId: string; notes?: string }[]
  }
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

interface ApiMenuRef {
  id?: number
  name_en?: string
  name_ar?: string
  price?: number | string
}

export interface ApiOrderItem {
  id?: number
  price_at_order?: number | string
  quantity?: number
  menu?: ApiMenuRef | null
  menus?: ApiMenuRef | null
  note?: string | null
  customization_details?: {
    ingredients?: Array<{ name_en?: string; action?: string; qty?: number }>
    options?: Array<{ name_en?: string; qty?: number }>
    comboChildren?: Array<{ name_en?: string }>
  }
}

// Order.id and Order.table_id are Postgres Int (server/prisma/schema.prisma),
// not strings - App.tsx's mapApiOrder already assumed this correctly and
// worked around this file's wrong declaration with an `as unknown as` cast.
export interface ApiOrder {
  id: number
  order_number?: number
  table_id?: number
  table?: { code?: string } | null
  status?: string
  type?: 'dine_in' | 'take_away'
  total?: number | string
  version?: number
  created_at: string
  order_items?: ApiOrderItem[]
}

// POST /api/orders response (server/index.js: presentPublicOrder(fullOrder)
// plus tracking_token) - the raw order minus table_session_id. status is
// always set on a just-created order, unlike the more general ApiOrder.
export interface CreatedOrder extends ApiOrder {
  status: string
  tracking_token: string
}

// GET /api/public/orders/:id/status
export interface PublicOrderStatus {
  id: number
  order_number?: number
  status: string
  version: number
  updated_at: string
}

// GET /api/public/promotions/validate (server/index.js). promotion.id/table_id
// are wire-accurate here already: Promotion.id is a UUID, not autoincrement.
interface RawPromotion {
  id: string
  admin_id: string
  code: string
  type: string
  value: number
  min_order: number | null
  start_at: string | null
  end_at: string | null
  usage_limit: number | null
  times_used: number
  active: boolean
  applies_to: string
  table_id: number | null
}

// What getOrdersPage() actually returns after its own mapping below:
// total/price_at_order are guaranteed numbers (Number(...) || 0), not the
// wire's number|string - App.tsx's mapApiOrder and everything downstream of
// getOrdersPage relies on that guarantee.
export interface MappedOrderItem extends Omit<ApiOrderItem, 'price_at_order' | 'menu'> {
  price_at_order: number
  menu: (Omit<ApiMenuRef, 'price'> & { price: number }) | null
}
export interface MappedOrder extends Omit<ApiOrder, 'total' | 'order_items'> {
  total: number
  order_items: MappedOrderItem[]
}

export interface CursorPage<T> {
  items: T[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
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
    type?: 'dine_in' | 'take_away' // Added type
    promotion_code?: string
    tip_percent?: number
    /** Required for type: 'dine_in'. The 30-minute table-session bearer
     * token obtained by exchanging the scanned QR capability. See
     * docs/contracts/table-capability.md — the server derives restaurant/
     * table identity from this token and ignores table_code/admin_id. */
    table_session_token?: string
    /** Required client-generated key for dine-in checkout. The backend scopes
     * it to the current table capability/version and returns the original
     * order for an unchanged retry. See docs/contracts/order-idempotency.md. */
    idempotency_key?: string
  }): Promise<CreatedOrder> {
    try {
      // Build function payload items
      const items = (orderData.items || []).map((it) => {
        // keep your nice kitchen note text
        const extrasNote = formatIngredientChoices(it.custom_ingredients ?? [], it.ingredient_names_map)
        const mergedNote = mergeNotes(it.note, extrasNote)

        // map tri-state ingredients -> picks for the function
        const ingredients: Array<{ ingredientId: string; action: 'remove' | 'extra'; qty?: number }> = it.checkout_payload?.ingredients
          ? [...it.checkout_payload.ingredients]
          : (it.custom_ingredients ?? []).reduce<Array<{ ingredientId: string; action: 'remove' | 'extra'; qty?: number }>>((result, c) => {
              if (c.action === 'no') result.push({ ingredientId: c.id, action: 'remove' });
              if (c.action === 'extra') result.push({ ingredientId: c.id, action: 'extra', qty: 1 });
              return result;
            }, [])

        return {
          menuId: it.menu_item_id,
          quantity: it.quantity ?? 1,
          notes: mergedNote || undefined,
          ingredients,
          options: it.checkout_payload?.options,
          comboChildren: it.checkout_payload?.comboChildren,
        }
      })

      const body = {
        items,
        type: orderData.type,
        promotionCode: orderData.promotion_code,
        tipPercent: orderData.tip_percent ?? 0,
      };

      const idempotencyHeaders = orderData.idempotency_key
        ? { 'Idempotency-Key': orderData.idempotency_key }
        : undefined;

      if (orderData.type === 'dine_in') {
        if (!orderData.table_session_token) {
          throw new ApiError({
            message: 'A valid table session is required to place a dine-in order.',
            status: 401,
            code: 'TABLE_SESSION_REQUIRED',
          });
        }
        // Dine-in identity comes from the table-session bearer token, not
        // from body tableCode/adminId — the server ignores the latter.
        return await api.postWithToken<CreatedOrder>('/orders', body, orderData.table_session_token, idempotencyHeaders);
      }

      // Call Backend API instead of Edge Function
      return await api.post<CreatedOrder>('/orders', {
        ...body,
        tableCode: orderData.table_code,
        adminId: orderData.admin_id,
      });
    } catch (error) {
      console.error('Order submission failed:', getErrorMessage(error));
      throw error
    }
  },

  async validatePromotion(input: {
    adminId: string
    code: string
    subtotal: number
    tableCode?: string
  }): Promise<Promotion> {
    const raw = await api.get<RawPromotion>('/public/promotions/validate', {
      adminId: input.adminId,
      code: input.code,
      subtotal: String(input.subtotal),
      ...(input.tableCode ? { table: input.tableCode } : {}),
    });
    return {
      ...raw,
      type: raw.type as Promotion['type'],
      applies_to: raw.applies_to as Promotion['applies_to'],
      table_id: raw.table_id == null ? null : String(raw.table_id),
    };
  },

  // Get orders for admin (raw, with nested menus; unchanged columns)
  async getOrdersPage(adminId: string, options: {
    status?: string;
    scope?: 'all' | 'active' | 'history';
    limit?: number;
    cursor?: string;
  } = {}): Promise<CursorPage<MappedOrder>> {
    try {
      const params: Record<string, string> = { adminId };
      if (options.status) params.status = options.status;
      if (options.scope) params.scope = options.scope;
      if (options.limit) params.limit = String(options.limit);
      if (options.cursor) params.cursor = options.cursor;
      const page = await api.get<CursorPage<ApiOrder>>('/orders', params);
      return {
        ...page,
        items: (page.items || []).map((o) => ({
        ...o,
        total: Number(o.total) || 0,
        order_items: (o.order_items || []).map((oi) => ({
          ...oi,
          price_at_order: Number(oi.price_at_order) || 0,
          menu: oi.menu ? { ...oi.menu, price: Number(oi.menu.price) || 0 } : null
        }))
        })),
      };
    } catch (error) {
      console.error('Error fetching orders:', error)
      throw error
    }
  },

  async getOrders(adminId: string, status?: string): Promise<MappedOrder[]> {
    return (await this.getOrdersPage(adminId, { status, limit: 50 })).items;
  },

  // Cleaned, mapped shape for Analytics (unit price already includes extras).
  // Unused since Analytics.tsx moved to server-computed aggregates
  // (adminService.getAnalytics) - kept typed rather than deleted since
  // removing it isn't part of this pass.
  async getOrdersForAnalytics(adminId: string): Promise<AnalyticsOrder[]> {
    // Reuse the getOrders API or create a specific analytics endpoint
    const data = (await this.getOrdersPage(adminId, { limit: 100 })).items;
    return (data ?? []).map((o) => ({
      id: String(o.id),
      tableNumber: String(o.table_id ?? ''), // join tables for code if you want the code instead of id
      status: o.status ?? 'pending',
      total: Number(o.total) || 0,
      timestamp: new Date(o.created_at),
      items: (o.order_items ?? []).map((oi) => {
        const m = oi.menu ?? oi.menus
        return {
          id: m?.id != null ? String(m.id) : undefined,
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
  async updateOrderStatus(orderId: string, status: string): Promise<ApiOrder> {
    try {
      // Implement PUT /api/orders/:id/status in backend
      return await api.put<ApiOrder>(`/orders/${orderId}/status`, { status });
    } catch (error) {
      console.error('Error updating order status:', error)
      throw error
    }
  },

  // Get order by ID (raw)
  // Unused, and there is no GET /api/orders/:id route on the server (only
  // /api/orders/:id/status) - this would 404 if ever called.
  async getOrderById(orderId: string): Promise<ApiOrder> {
    try {
      return await api.get<ApiOrder>(`/orders/${orderId}`);
    } catch (error) {
      console.error('Error fetching order:', error)
      throw error
    }
  },

  async getPublicOrderStatus(orderId: number, trackingToken: string): Promise<PublicOrderStatus> {
    return await api.getWithToken<PublicOrderStatus>(`/public/orders/${orderId}/status`, trackingToken)
  },
}
