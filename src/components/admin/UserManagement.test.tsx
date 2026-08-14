import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UserManagement from './UserManagement';
import { adminService } from '../../services/adminService';
import { ApiError } from '../../services/api';
import type { Admin } from '../../lib/supabase';

vi.mock('../../services/adminService', () => ({
  adminService: {
    getAllAdmins: vi.fn(),
    deleteAdmin: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const admin: Admin = {
  id: 'admin-1',
  email: 'owner@example.com',
  restaurant_name: 'Test Restaurant',
} as Admin;

describe('UserManagement loading/empty/error states', () => {
  it('shows a loading state before the admins list resolves', async () => {
    let resolvePromise: (value: Admin[]) => void = () => {};
    vi.mocked(adminService.getAllAdmins).mockReturnValue(
      new Promise((resolve) => { resolvePromise = resolve; }),
    );

    render(<UserManagement />);

    expect(screen.getByLabelText('Loading users')).toBeInTheDocument();

    resolvePromise([admin]);
    await waitFor(() => expect(screen.getByText('Test Restaurant')).toBeInTheDocument());
    expect(screen.queryByLabelText('Loading users')).not.toBeInTheDocument();
  });

  it('shows a dedicated empty state with an add-user action when there are no admins', async () => {
    vi.mocked(adminService.getAllAdmins).mockResolvedValue([]);

    render(<UserManagement />);

    await waitFor(() => expect(screen.getByText('No users yet')).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: /add user/i }).length).toBeGreaterThan(0);
  });

  it('shows the real error message and a retry action instead of swallowing the failure', async () => {
    const user = userEvent.setup();
    vi.mocked(adminService.getAllAdmins)
      .mockRejectedValueOnce(new ApiError({ message: 'Restaurant slug is invalid', status: 422, code: 'VALIDATION_ERROR' }))
      .mockResolvedValueOnce([admin]);

    render(<UserManagement />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Restaurant slug is invalid'));

    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(screen.getByText('Test Restaurant')).toBeInTheDocument());
    expect(adminService.getAllAdmins).toHaveBeenCalledTimes(2);
  });

  it('shows a distinct connection message for a network failure, not a raw error string', async () => {
    vi.mocked(adminService.getAllAdmins).mockRejectedValue(
      new ApiError({ message: 'TypeError: Failed to fetch', code: 'NETWORK_ERROR' }),
    );

    render(<UserManagement />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Check your internet connection'));
  });
});
