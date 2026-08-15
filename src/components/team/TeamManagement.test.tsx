import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TeamManagement from './TeamManagement';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { memberService } from '../../services/memberService';
import { ApiError } from '../../services/api';

let mockUser: { id: string; role: 'OWNER' | 'MANAGER' | 'STAFF' } | null = { id: 'user-1', role: 'OWNER' };

vi.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('../../services/memberService', () => ({
  memberService: { list: vi.fn(), add: vi.fn(), update: vi.fn() },
}));

const owner = {
  userId: 'user-1',
  email: 'owner@example.com',
  name: 'Owner Person',
  role: 'OWNER' as const,
  status: 'ACTIVE' as const,
  defaultBranch: null,
  createdAt: new Date().toISOString(),
};

const staffer = {
  userId: 'user-2',
  email: 'staff@example.com',
  name: 'Staff Person',
  role: 'STAFF' as const,
  status: 'ACTIVE' as const,
  defaultBranch: null,
  createdAt: new Date().toISOString(),
};

const renderTeam = () =>
  render(
    <LanguageProvider>
      <TeamManagement />
    </LanguageProvider>
  );

afterEach(() => {
  vi.restoreAllMocks();
  mockUser = { id: 'user-1', role: 'OWNER' };
});

describe('TeamManagement', () => {
  it('renders nothing for a STAFF member (the server rejects the read too)', () => {
    mockUser = { id: 'user-2', role: 'STAFF' };

    const { container } = renderTeam();

    expect(container).toBeEmptyDOMElement();
    expect(memberService.list).not.toHaveBeenCalled();
  });

  it('loads and lists members', async () => {
    vi.mocked(memberService.list).mockResolvedValueOnce([owner, staffer]);

    renderTeam();

    await waitFor(() => expect(screen.getByText('Owner Person')).toBeInTheDocument());
    expect(screen.getByText('Staff Person')).toBeInTheDocument();
  });

  it('shows an error with retry on a load failure', async () => {
    vi.mocked(memberService.list).mockRejectedValueOnce(
      new ApiError({ message: 'Database unavailable', status: 500, code: 'SERVER_ERROR' })
    );

    renderTeam();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('a MANAGER sees read-only role/status badges instead of editable controls', async () => {
    mockUser = { id: 'user-3', role: 'MANAGER' };
    vi.mocked(memberService.list).mockResolvedValueOnce([owner, staffer]);

    renderTeam();

    await waitFor(() => expect(screen.getByText('Staff Person')).toBeInTheDocument());
    expect(screen.queryByLabelText(/change role for staff person/i)).not.toBeInTheDocument();
  });

  it('an OWNER can change a member role directly', async () => {
    const user = userEvent.setup();
    vi.mocked(memberService.list).mockResolvedValueOnce([owner, staffer]);
    vi.mocked(memberService.update).mockResolvedValueOnce({ ...staffer, role: 'MANAGER' });

    renderTeam();
    await waitFor(() => expect(screen.getByText('Staff Person')).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/change role for staff person/i), 'MANAGER');

    expect(memberService.update).toHaveBeenCalledWith('user-2', { role: 'MANAGER' });
  });

  it('confirms before suspending a member, and does nothing on cancel', async () => {
    const user = userEvent.setup();
    vi.mocked(memberService.list).mockResolvedValueOnce([owner, staffer]);

    renderTeam();
    await waitFor(() => expect(screen.getByText('Staff Person')).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/change status for staff person/i), 'SUSPENDED');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(memberService.update).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('suspends a member after confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(memberService.list).mockResolvedValueOnce([owner, staffer]);
    vi.mocked(memberService.update).mockResolvedValueOnce({ ...staffer, status: 'SUSPENDED' });

    renderTeam();
    await waitFor(() => expect(screen.getByText('Staff Person')).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/change status for staff person/i), 'SUSPENDED');
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    expect(memberService.update).toHaveBeenCalledWith('user-2', { status: 'SUSPENDED' });
  });

  it('the owner cannot select suspended for their own row', async () => {
    vi.mocked(memberService.list).mockResolvedValueOnce([owner, staffer]);

    renderTeam();
    await waitFor(() => expect(screen.getByText('Owner Person')).toBeInTheDocument());

    const ownStatusSelect = screen.getByLabelText(/change status for owner person/i) as HTMLSelectElement;
    const optionValues = Array.from(ownStatusSelect.options).map(o => o.value);
    expect(optionValues).not.toContain('SUSPENDED');
  });

  it('adds a new member through the modal', async () => {
    const user = userEvent.setup();
    vi.mocked(memberService.list).mockResolvedValueOnce([owner]);
    vi.mocked(memberService.add).mockResolvedValueOnce(staffer);

    renderTeam();
    await waitFor(() => expect(screen.getByText('Owner Person')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add member/i }));
    const dialog = screen.getByRole('dialog');
    await user.type(screen.getByLabelText('Email'), 'staff@example.com');
    await user.type(screen.getByLabelText('Name'), 'Staff Person');
    await user.click(within(dialog).getByRole('button', { name: /add member/i }));

    await waitFor(() =>
      expect(memberService.add).toHaveBeenCalledWith({
        email: 'staff@example.com',
        name: 'Staff Person',
        password: undefined,
        role: 'STAFF',
      })
    );
    await waitFor(() => expect(screen.getByText('Staff Person')).toBeInTheDocument());
  });
});
