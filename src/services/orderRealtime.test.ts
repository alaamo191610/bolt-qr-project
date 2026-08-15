import { describe, expect, it } from 'vitest';
import {
  isNewerOrderEvent,
  isOrderRealtimeEvent,
} from './orderRealtime';

const event = {
  protocolVersion: 1 as const,
  eventId: 'event-1',
  occurredAt: '2026-08-15T10:00:01.000Z',
  order: {
    id: 41,
    status: 'preparing',
    version: 2,
    updated_at: '2026-08-15T10:00:00.000Z',
  },
};

describe('order realtime event guards', () => {
  it('accepts the supported envelope only when it advances the matching order', () => {
    expect(isOrderRealtimeEvent(event)).toBe(true);
    expect(isNewerOrderEvent(event, { orderId: 41, currentVersion: 1 })).toBe(true);
    expect(isNewerOrderEvent(event, { orderId: 41, currentVersion: 2 })).toBe(false);
    expect(isNewerOrderEvent(event, { orderId: 42, currentVersion: 1 })).toBe(false);
  });

  it('rejects unsupported protocols and malformed sequences', () => {
    expect(isOrderRealtimeEvent({ ...event, protocolVersion: 2 })).toBe(false);
    expect(isOrderRealtimeEvent({ ...event, order: { ...event.order, version: 0 } })).toBe(false);
    expect(isOrderRealtimeEvent({ ...event, order: { ...event.order, id: '41' } })).toBe(false);
  });
});
