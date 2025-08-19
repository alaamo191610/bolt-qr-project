export type OrderStatusKey = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled'

export type OrderStatusDef = {
  key: OrderStatusKey
  label_en: string
  label_ar: string
  customerVisible: boolean
  notify?: boolean
  slaMin?: number
}

export type OrderFlowRules = {
  statuses: OrderStatusDef[]
  transitions: Record<OrderStatusKey, OrderStatusKey[]>
  autoCancelAfterMin?: number | null
}

export type KDSPrefs = {
  ticketGrouping: 'none' | 'byTable' | 'byCourse'
  soundEnabled: boolean
  soundPreset: 'ding' | 'bell' | 'knock' | 'beep'
  autoBumpMinutes: number
  columns: OrderStatusKey[]
  colorScheme: 'light' | 'dark' | 'high-contrast'
  showModifiersLarge: boolean
  ticketScale: number // 0.8–1.4
  prepTimeColors: { ok: number; warn: number }
}

export type AdminSettings = {
  admin_id: string
  order_rules: OrderFlowRules
  kds_prefs: KDSPrefs
}