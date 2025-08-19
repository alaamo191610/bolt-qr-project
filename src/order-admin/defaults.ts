import type { OrderFlowRules, KDSPrefs } from './types'

export const DEFAULT_FLOW: OrderFlowRules = {
  statuses: [
    { key: 'pending',   label_en: 'Pending',   label_ar: 'قيد الانتظار', customerVisible: true },
    { key: 'preparing', label_en: 'Preparing', label_ar: 'قيد التحضير',  customerVisible: true, slaMin: 10 },
    { key: 'ready',     label_en: 'Ready',     label_ar: 'جاهز',          customerVisible: true, notify: true },
    { key: 'served',    label_en: 'Served',    label_ar: 'تم التقديم',     customerVisible: false },
    { key: 'cancelled', label_en: 'Cancelled', label_ar: 'أُلغي',         customerVisible: true }
  ],
  transitions: {
    pending:   ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready:     ['served', 'cancelled'],
    served:    [],
    cancelled: []
  },
  autoCancelAfterMin: 15,
}

export const DEFAULT_KDS: KDSPrefs = {
  ticketGrouping: 'byTable',
  soundEnabled: true,
  soundPreset: 'ding',
  autoBumpMinutes: 0,
  columns: ['pending', 'preparing', 'ready'],
  colorScheme: 'light',
  showModifiersLarge: true,
  ticketScale: 1,
  prepTimeColors: { ok: 10, warn: 18 },
}