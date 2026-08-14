import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PromotionsManager from './PromotionsManager';
import { adminService } from '../../services/adminService';
import { ApiError } from '../../services/api';

vi.mock('../../services/adminService', () => ({
  adminService: { listPromotions: vi.fn(), savePromotion: vi.fn(), togglePromotion: vi.fn() },
}));

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: () => '', isRTL: false }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PromotionsManager load failure', () => {
  it('shows an error with retry instead of the "No promotions yet" empty state on a load failure', async () => {
    vi.mocked(adminService.listPromotions).mockRejectedValueOnce(
      new ApiError({ message: 'Database unavailable', status: 500, code: 'SERVER_ERROR' }),
    );

    render(<PromotionsManager adminId="admin-1" />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText(/no promotions yet/i)).not.toBeInTheDocument();
  });

  it('shows the genuine empty state when the load succeeds with zero promotions', async () => {
    vi.mocked(adminService.listPromotions).mockResolvedValue([]);

    render(<PromotionsManager adminId="admin-1" />);

    await waitFor(() => expect(adminService.listPromotions).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retries the load on demand', async () => {
    const user = userEvent.setup();
    vi.mocked(adminService.listPromotions)
      .mockRejectedValueOnce(new ApiError({ message: 'offline', code: 'NETWORK_ERROR' }))
      .mockResolvedValueOnce([]);

    render(<PromotionsManager adminId="admin-1" />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(adminService.listPromotions).toHaveBeenCalledTimes(2));
  });
});
