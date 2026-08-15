import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OrderConfirmation from './OrderConfirmation';
import { orderService } from '../../services/orderService';
import { ApiError } from '../../services/api';

const translations: Record<string, string> = {
  'status.pending': 'Pending',
  'status.preparing': 'Preparing',
  'status.ready': 'Ready',
  'status.served': 'Served',
  'status.current': 'Current',
  'status.trackingExpired': 'This tracking link has expired',
  'status.trackingExpiredDescription': 'Please ask restaurant staff for your order status.',
  'menu.orderPlaced': 'Order placed',
  'menu.orderPlacedDescription': 'Table {table}',
  'menu.startNewOrder': 'Start new order',
  'menu.addMoreItems': 'Add more items',
};

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      let text = translations[key] ?? key;
      if (vars) Object.entries(vars).forEach(([k, v]) => { text = text.replace(`{${k}}`, v); });
      return text;
    },
    isRTL: false,
  }),
}));

const socketHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
vi.mock('../../services/socket', () => ({
  socket: {
    connected: true,
    connect: vi.fn(),
    on: (event: string, handler: (...args: unknown[]) => void) => {
      socketHandlers[event] = [...(socketHandlers[event] || []), handler];
    },
    off: vi.fn(),
  },
  joinOrderRoom: vi.fn(),
}));

vi.mock('../../services/orderService', () => ({
  orderService: { getPublicOrderStatus: vi.fn() },
}));

afterEach(() => {
  vi.restoreAllMocks();
  Object.keys(socketHandlers).forEach((key) => delete socketHandlers[key]);
});

const baseOrder = {
  id: 1,
  status: 'pending',
  version: 1,
  order_number: 42,
  tracking_token: 'a-valid-tracking-token',
  table: { code: '5' },
};

describe('OrderConfirmation tracking-link expiry', () => {
  it('shows the expired-link screen instead of freezing when the tracking token has expired', async () => {
    vi.mocked(orderService.getPublicOrderStatus).mockRejectedValue(
      new ApiError({ message: 'Order tracking session expired', status: 401, code: 'AUTHENTICATION_REQUIRED' }),
    );

    render(<OrderConfirmation order={baseOrder} onStartNewOrder={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This tracking link has expired'));
    expect(screen.getByRole('button', { name: /start new order/i })).toBeInTheDocument();
  });

  it('does not show the expired screen for a transient network/server error', async () => {
    vi.mocked(orderService.getPublicOrderStatus).mockRejectedValue(
      new ApiError({ message: 'offline', code: 'NETWORK_ERROR' }),
    );

    render(<OrderConfirmation order={baseOrder} onStartNewOrder={vi.fn()} />);

    await waitFor(() => expect(orderService.getPublicOrderStatus).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Order placed')).toBeInTheDocument();
  });

  it('renders the normal tracker when the status refreshes successfully', async () => {
    vi.mocked(orderService.getPublicOrderStatus).mockResolvedValue({
      id: 1,
      status: 'preparing',
      version: 2,
      updated_at: new Date().toISOString(),
    });

    render(<OrderConfirmation order={baseOrder} onStartNewOrder={vi.fn()} />);

    await waitFor(() => expect(orderService.getPublicOrderStatus).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('applies only newer matching protocol-v1 socket events', async () => {
    vi.mocked(orderService.getPublicOrderStatus).mockResolvedValue({
      id: 1,
      status: 'pending',
      version: 1,
      updated_at: new Date().toISOString(),
    });
    const onOrderChange = vi.fn();
    render(
      <OrderConfirmation
        order={baseOrder}
        onStartNewOrder={vi.fn()}
        onOrderChange={onOrderChange}
      />,
    );
    await waitFor(() => expect(orderService.getPublicOrderStatus).toHaveBeenCalled());
    onOrderChange.mockClear();

    const handler = socketHandlers['order.status.v1'][0];
    await act(async () => handler({
      protocolVersion: 1,
      eventId: 'event-new',
      occurredAt: new Date().toISOString(),
      order: { id: 1, status: 'preparing', version: 2, updated_at: new Date().toISOString() },
    }));
    await act(async () => handler({
      protocolVersion: 1,
      eventId: 'event-stale',
      occurredAt: new Date().toISOString(),
      order: { id: 1, status: 'served', version: 1, updated_at: new Date().toISOString() },
    }));
    await act(async () => handler({
      protocolVersion: 1,
      eventId: 'event-other-order',
      occurredAt: new Date().toISOString(),
      order: { id: 2, status: 'served', version: 3, updated_at: new Date().toISOString() },
    }));

    expect(onOrderChange).toHaveBeenCalledTimes(1);
    expect(onOrderChange).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      status: 'preparing',
      version: 2,
    }));
  });

  it('refetches authoritative status when a suspended page is shown again', async () => {
    vi.mocked(orderService.getPublicOrderStatus)
      .mockResolvedValueOnce({
        id: 1,
        status: 'pending',
        version: 1,
        updated_at: new Date().toISOString(),
      })
      .mockResolvedValueOnce({
        id: 1,
        status: 'ready',
        version: 3,
        updated_at: new Date().toISOString(),
      });
    const onOrderChange = vi.fn();
    render(
      <OrderConfirmation
        order={baseOrder}
        onStartNewOrder={vi.fn()}
        onOrderChange={onOrderChange}
      />,
    );
    await waitFor(() => expect(orderService.getPublicOrderStatus).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event('pageshow'));

    await waitFor(() => expect(orderService.getPublicOrderStatus).toHaveBeenCalledTimes(2));
    expect(onOrderChange).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'ready',
      version: 3,
    }));
  });
});
