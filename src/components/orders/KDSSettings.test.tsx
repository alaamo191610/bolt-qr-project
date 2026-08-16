import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KDSSettings from './KDSSettings';
import { adminService } from '../../services/adminService';
import { ApiError } from '../../services/api';

vi.mock('../../services/adminService', () => ({
  adminService: { getAdminSettings: vi.fn(), saveKDSPrefs: vi.fn() },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('KDSSettings load failure', () => {
  it('does not silently fall back to DEFAULT_KDS on a load failure - shows an error with retry instead', async () => {
    vi.mocked(adminService.getAdminSettings).mockRejectedValueOnce(
      new ApiError({ message: 'Database unavailable', status: 500, code: 'SERVER_ERROR' }),
    );

    render(<KDSSettings adminId="admin-1" />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('retries the load and renders the settings once the retry succeeds', async () => {
    const user = userEvent.setup();
    vi.mocked(adminService.getAdminSettings)
      .mockRejectedValueOnce(new ApiError({ message: 'offline', code: 'NETWORK_ERROR' }))
      .mockResolvedValueOnce({
        id: 'admin-1',
        order_rules: null,
        kds_prefs: {
          ticketGrouping: 'byTable',
          soundEnabled: true,
          soundPreset: 'ding',
          autoBumpMinutes: 0,
          columns: ['pending', 'preparing', 'ready'],
          colorScheme: 'light',
          showModifiersLarge: true,
          ticketScale: 1,
          prepTimeColors: { ok: 10, warn: 18 },
        },
      });

    render(<KDSSettings adminId="admin-1" />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(adminService.getAdminSettings).toHaveBeenCalledTimes(2);
  });
});
