import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OrderingStatusControl from './OrderingStatusControl';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { orderingStateService } from '../../services/orderingStateService';
import { ApiError } from '../../services/api';

let mockRole: 'OWNER' | 'MANAGER' | 'STAFF' | undefined = 'OWNER';

vi.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: mockRole ? { role: mockRole } : null }),
}));

vi.mock('../../services/orderingStateService', () => ({
  orderingStateService: { get: vi.fn(), set: vi.fn() },
}));

const BRANCH_TOKEN_PAYLOAD = { branchId: 'branch-1' };
const fakeToken = () =>
  `header.${btoa(JSON.stringify(BRANCH_TOKEN_PAYLOAD))}.signature`;

const renderControl = () =>
  render(
    <LanguageProvider>
      <OrderingStatusControl />
    </LanguageProvider>
  );

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  mockRole = 'OWNER';
});

describe('OrderingStatusControl', () => {
  it('renders nothing for a STAFF member (the server rejects the read too)', async () => {
    mockRole = 'STAFF';
    localStorage.setItem('auth_token', fakeToken());

    const { container } = renderControl();

    expect(container).toBeEmptyDOMElement();
    expect(orderingStateService.get).not.toHaveBeenCalled();
  });

  it('renders nothing when there is no resolvable branch on the token', async () => {
    localStorage.removeItem('auth_token');

    const { container } = renderControl();

    expect(container).toBeEmptyDOMElement();
    expect(orderingStateService.get).not.toHaveBeenCalled();
  });

  it('loads and highlights the current state', async () => {
    localStorage.setItem('auth_token', fakeToken());
    vi.mocked(orderingStateService.get).mockResolvedValueOnce({
      branchId: 'branch-1',
      state: 'PAUSED',
      updatedAt: new Date().toISOString(),
    });

    renderControl();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /paused/i })).toHaveAttribute('aria-pressed', 'true')
    );
    expect(screen.getByRole('button', { name: /^open/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows an error with retry on a load failure', async () => {
    localStorage.setItem('auth_token', fakeToken());
    vi.mocked(orderingStateService.get).mockRejectedValueOnce(
      new ApiError({ message: 'Database unavailable', status: 500, code: 'SERVER_ERROR' })
    );

    renderControl();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^open/i })).not.toBeInTheDocument();
  });

  it('applies OPEN immediately without a confirmation dialog', async () => {
    const user = userEvent.setup();
    localStorage.setItem('auth_token', fakeToken());
    vi.mocked(orderingStateService.get).mockResolvedValueOnce({
      branchId: 'branch-1',
      state: 'PAUSED',
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(orderingStateService.set).mockResolvedValueOnce({
      branchId: 'branch-1',
      state: 'OPEN',
      updatedAt: new Date().toISOString(),
    });

    renderControl();
    await waitFor(() => expect(orderingStateService.get).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /^open/i }));

    expect(orderingStateService.set).toHaveBeenCalledWith('branch-1', 'OPEN');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^open/i })).toHaveAttribute('aria-pressed', 'true')
    );
  });

  it('confirms before leaving OPEN, and does nothing on cancel', async () => {
    const user = userEvent.setup();
    localStorage.setItem('auth_token', fakeToken());
    vi.mocked(orderingStateService.get).mockResolvedValueOnce({
      branchId: 'branch-1',
      state: 'OPEN',
      updatedAt: new Date().toISOString(),
    });

    renderControl();
    await waitFor(() => expect(orderingStateService.get).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /^paused/i }));
    expect(screen.getByText(/switch to/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(orderingStateService.set).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^open/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('rolls back the optimistic state when the update fails', async () => {
    const user = userEvent.setup();
    localStorage.setItem('auth_token', fakeToken());
    vi.mocked(orderingStateService.get).mockResolvedValueOnce({
      branchId: 'branch-1',
      state: 'OPEN',
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(orderingStateService.set).mockRejectedValueOnce(
      new ApiError({ message: 'offline', code: 'NETWORK_ERROR' })
    );

    renderControl();
    await waitFor(() => expect(orderingStateService.get).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /^paused/i }));
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(orderingStateService.set).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^open/i })).toHaveAttribute('aria-pressed', 'true')
    );
    expect(screen.getByRole('button', { name: /^paused/i })).toHaveAttribute('aria-pressed', 'false');
  });
});
