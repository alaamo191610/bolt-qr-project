import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OrderWorkflowRules from './OrderWorkflowRules';
import { adminService } from '../../services/adminService';
import { ApiError } from '../../services/api';

vi.mock('../../services/adminService', () => ({
  adminService: { getAdminSettings: vi.fn(), saveOrderRules: vi.fn() },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OrderWorkflowRules load failure', () => {
  it('does not silently fall back to DEFAULT_FLOW on a load failure - shows an error with retry instead', async () => {
    vi.mocked(adminService.getAdminSettings).mockRejectedValueOnce(
      new ApiError({ message: 'Database unavailable', status: 500, code: 'SERVER_ERROR' }),
    );

    render(<OrderWorkflowRules adminId="admin-1" />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('retries the load on demand', async () => {
    const user = userEvent.setup();
    vi.mocked(adminService.getAdminSettings)
      .mockRejectedValueOnce(new ApiError({ message: 'offline', code: 'NETWORK_ERROR' }))
      .mockResolvedValueOnce({ order_rules: { statuses: [] } });

    render(<OrderWorkflowRules adminId="admin-1" />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(adminService.getAdminSettings).toHaveBeenCalledTimes(2));
  });
});
