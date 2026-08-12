export const ORDER_STATUS_TRANSITIONS = Object.freeze({
  pending: Object.freeze(new Set(['preparing', 'cancelled'])),
  preparing: Object.freeze(new Set(['ready', 'cancelled'])),
  ready: Object.freeze(new Set(['served', 'cancelled'])),
  served: Object.freeze(new Set()),
  cancelled: Object.freeze(new Set()),
});

export const ORDER_STATUSES = new Set(Object.keys(ORDER_STATUS_TRANSITIONS));

export function canTransitionOrder(from, to) {
  return ORDER_STATUS_TRANSITIONS[from]?.has(to) ?? false;
}
