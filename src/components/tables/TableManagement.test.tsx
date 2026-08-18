import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TableManagement from './TableManagement';

vi.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'admin-1' } }),
}));

vi.mock('../../services/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn() },
}));

vi.mock('../../services/tableService', () => ({
  tableService: {
    addTable: vi.fn(),
    deleteTable: vi.fn(),
    updateTable: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

describe('TableManagement secure QR entry point', () => {
  it('does not render a capability-less QR and opens QR Studio instead', async () => {
    const user = userEvent.setup();
    const onOpenQrStudio = vi.fn();

    render(
      <TableManagement
        tables={[{
          id: 12,
          number: '12',
          status: 'available',
          capacity: 4,
          adminId: 'admin-1',
        }]}
        setTables={vi.fn()}
        onDataChange={vi.fn()}
        onOpenQrStudio={onOpenQrStudio}
      />,
    );

    expect(screen.queryByRole('img', { name: /qr 12/i })).not.toBeInTheDocument();
    expect(screen.getByText('Manage in QR Studio')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open QR Studio for table 12' }));
    expect(onOpenQrStudio).toHaveBeenCalledTimes(1);
  });

  it('persists table status changes instead of only changing local state', async () => {
    const user = userEvent.setup();
    const { tableService } = await import('../../services/tableService');
    vi.mocked(tableService.updateTable).mockResolvedValue({
      id: 12,
      admin_id: 'admin-1',
      organization_id: 'org-1',
      branch_id: 'branch-1',
      code: '12',
      capacity: 4,
      status: 'occupied',
      created_at: new Date().toISOString(),
    });

    render(
      <TableManagement
        tables={[{ id: 12, number: '12', status: 'available', capacity: 4, adminId: 'admin-1' }]}
        setTables={vi.fn()}
        onDataChange={vi.fn()}
        onOpenQrStudio={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status for table 12' }), 'occupied');
    await waitFor(() => expect(tableService.updateTable).toHaveBeenCalledWith('12', { status: 'occupied' }));
  });
});
