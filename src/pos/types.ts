export interface PosEmployee { id: string; name: string }
export interface PosBranch { id: string; name: string; currency?: string; timezone?: string }
export interface PosCategory { id: number; name_en: string; name_ar?: string | null; sort_order?: number | null }
export interface PosMenuItem { id: number; category_id?: number | null; name_en: string; name_ar?: string | null; price: number | string; image_url?: string | null; has_modifiers: boolean; tags: string[] }
export interface PosRegister { id: string; code: string; name: string }
export interface PosModifierOption { id: number; name_en: string; name_ar?: string | null; price_delta: number | string; is_default?: boolean | null }
export interface PosModifierGroup { id: number; name_en: string; name_ar?: string | null; selection_type?: string | null; min_select?: number | null; max_select?: number | null; required?: boolean | null; modifier_options: PosModifierOption[] }
export interface PosMenuOptions { id: number; name: string; price: number | string; modifierGroups: PosModifierGroup[]; removableIngredients: Array<{ id: number; name_en: string; name_ar?: string | null }> }
export interface PosOrderItem {
  id: number; menu_id: number | null; quantity: number | null; price_at_order: number | string;
  note?: string | null; customizations?: { modifiers?: Array<{ name: string; options: Array<{ name: string; priceDelta: string }> }>; removedIngredients?: Array<{ name: string }> };
  status: 'ACTIVE' | 'VOIDED'; void_reason?: string | null; menu?: { name_en: string; name_ar?: string | null } | null;
}
export interface PosPayment { id: string; method: string; status: string; amount: number | string; created_at: string; refunds?: Array<{ id: string; amount: number | string; reason: string }> }
export interface PosCheck {
  id: string;
  number: number;
  version: number;
  status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'CLOSED';
  subtotal: number | string;
  total: number | string;
  paid: number | string;
  balance: number | string;
  payments?: PosPayment[];
  orders?: Array<{ id: number; order_items: PosOrderItem[] }>;
}
export interface PosReceipt { receiptNumber: string; restaurant: string; branch: string; timezone: string; currency: string; check: PosCheck; totals: { subtotal: number | string; total: number | string; paid: number | string; refunded: number | string } }
export interface PosBootstrap {
  employee: { id: string; name: string; role: string; permissions: string[] };
  branch: PosBranch;
  categories: PosCategory[];
  menus: PosMenuItem[];
  registers: PosRegister[];
  openChecks: PosCheck[];
  currentShift: { id: string; register_id: string; opening_cash: number | string; opened_at: string } | null;
}
