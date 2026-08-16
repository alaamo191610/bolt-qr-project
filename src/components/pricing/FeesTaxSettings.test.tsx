import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FeesTaxSettings from './FeesTaxSettings';
import { adminService } from '../../services/adminService';
import { ApiError } from '../../services/api';

vi.mock('../../services/adminService', () => ({
  adminService: { getAdminMonetarySettings: vi.fn(), saveBillingSettings: vi.fn() },
}));

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, isRTL: false }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FeesTaxSettings load failure', () => {
  it('does not silently fall back to DEFAULT_BILLING on a load failure - shows an error with retry instead', async () => {
    vi.mocked(adminService.getAdminMonetarySettings).mockRejectedValueOnce(
      new ApiError({ message: 'Database unavailable', status: 500, code: 'SERVER_ERROR' }),
    );

    render(<FeesTaxSettings adminId="admin-1" />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    // The form fields (which would let the admin "Save" and overwrite real
    // settings with defaults) must not render while the load has failed.
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('retries the load and renders the form once the retry succeeds', async () => {
    const user = userEvent.setup();
    vi.mocked(adminService.getAdminMonetarySettings)
      .mockRejectedValueOnce(new ApiError({ message: 'offline', code: 'NETWORK_ERROR' }))
      .mockResolvedValueOnce({
        id: 'admin-1',
        restaurant_name: null,
        logo_url: null,
        pricing_prefs: null,
        billing_settings: { vatPercent: 15, serviceChargePercent: 0, deliveryFee: 0, showVatLine: true, showServiceChargeLine: false },
      });

    render(<FeesTaxSettings adminId="admin-1" />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /tryAgain/i }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(adminService.getAdminMonetarySettings).toHaveBeenCalledTimes(2);
  });
});
