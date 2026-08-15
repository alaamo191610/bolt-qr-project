export const ORDER_REALTIME_PROTOCOL_VERSION = 1 as const;

export interface OrderRealtimeSnapshot {
  id: number;
  status: string;
  version: number;
  updated_at: string;
}

export interface OrderRealtimeEvent<TRepresentation = unknown> {
  protocolVersion: typeof ORDER_REALTIME_PROTOCOL_VERSION;
  eventId: string;
  occurredAt: string;
  order: OrderRealtimeSnapshot;
  orderRepresentation?: TRepresentation;
}

export const isOrderRealtimeEvent = (value: unknown): value is OrderRealtimeEvent => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OrderRealtimeEvent>;
  return candidate.protocolVersion === ORDER_REALTIME_PROTOCOL_VERSION
    && typeof candidate.eventId === 'string'
    && typeof candidate.occurredAt === 'string'
    && Boolean(candidate.order)
    && Number.isInteger(candidate.order?.id)
    && candidate.order!.id > 0
    && typeof candidate.order?.status === 'string'
    && Number.isInteger(candidate.order?.version)
    && candidate.order!.version > 0
    && typeof candidate.order?.updated_at === 'string';
};

export const isNewerOrderEvent = (
  value: unknown,
  { orderId, currentVersion }: { orderId: number; currentVersion: number },
): value is OrderRealtimeEvent => isOrderRealtimeEvent(value)
  && value.order.id === orderId
  && value.order.version > currentVersion;

