import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OrderManagement, { type Order } from './OrderManagement';

vi.mock('../../contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatPrice: (amount: number) => `$${amount.toFixed(2)}` }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const baseOrder: Order = {
  id: 1,
  order_number: 42,
  tableNumber: '5',
  items: [{ name: 'Burger', price: 10, quantity: 1 }],
  total: 10,
  status: 'pending',
  timestamp: new Date().toISOString(),
  type: 'dine_in',
};

const advanceOrder = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /mark preparing/i }));
  await user.click(screen.getByRole('button', { name: 'Confirm' }));
};

describe('OrderManagement status change', () => {
  it('reverts the optimistic status update and shows an inline error when the backend call fails', async () => {
    const user = userEvent.setup();
    const setOrders = vi.fn();
    let orders = [baseOrder];
    setOrders.mockImplementation((updater: (prev: Order[]) => Order[]) => {
      orders = updater(orders);
    });

    const onStatusChange = vi.fn().mockRejectedValue(new Error('network down'));

    const { rerender } = render(
      <OrderManagement orders={orders} setOrders={setOrders} onStatusChange={onStatusChange} />,
    );

    await advanceOrder(user);

    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith(1, 'preparing'));

    // Reverted to the original status after the rejection, not left on the optimistic guess
    await waitFor(() => expect(orders[0].status).toBe('pending'));
    rerender(<OrderManagement orders={orders} setOrders={setOrders} onStatusChange={onStatusChange} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Status update failed');
  });

  it('does not show a failure banner when the status change succeeds', async () => {
    const user = userEvent.setup();
    const setOrders = vi.fn();
    let orders = [baseOrder];
    setOrders.mockImplementation((updater: (prev: Order[]) => Order[]) => {
      orders = updater(orders);
    });

    const onStatusChange = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <OrderManagement orders={orders} setOrders={setOrders} onStatusChange={onStatusChange} />,
    );

    await advanceOrder(user);
    rerender(<OrderManagement orders={orders} setOrders={setOrders} onStatusChange={onStatusChange} />);

    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith(1, 'preparing'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(orders[0].status).toBe('preparing');
  });
});
