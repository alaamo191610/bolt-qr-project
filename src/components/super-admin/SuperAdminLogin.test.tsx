import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SuperAdminLogin from './SuperAdminLogin';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  verifyMfa: vi.fn(),
  navigate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('react-router-dom', async importOriginal => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useNavigate: () => mocks.navigate,
}));

vi.mock('../../services/superAdminService', () => ({
  superAdminService: {
    login: mocks.login,
    verifyMfa: mocks.verifyMfa,
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: mocks.success, error: mocks.error },
}));

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('SuperAdmin MFA login', () => {
  it('enrolls TOTP and requires recovery-code acknowledgement before storing the session', async () => {
    const user = userEvent.setup();
    mocks.login.mockResolvedValue({
      mfaRequired: true,
      enrollmentRequired: true,
      challengeToken: 'challenge-token',
      enrollment: {
        secret: 'BASE32SETUPSECRET',
        otpauthUri: 'otpauth://totp/Bolt',
      },
    });
    mocks.verifyMfa.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'SUPER_ADMIN' },
      recoveryCodes: ['AAAAA-BBBBB-CCCCC-DDDDD', 'EEEEE-FFFFF-11111-22222'],
    });

    render(<SuperAdminLogin />);
    await user.type(screen.getByLabelText('Email Address'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByTestId('mfa-secret')).toHaveTextContent('BASE32SETUPSECRET');
    expect(mocks.login).toHaveBeenCalledWith('admin@example.com', 'password');

    await user.type(screen.getByLabelText('Six-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));

    expect(await screen.findByTestId('recovery-codes')).toHaveTextContent('AAAAA-BBBBB-CCCCC-DDDDD');
    expect(mocks.verifyMfa).toHaveBeenCalledWith('challenge-token', '123456', false);
    expect(sessionStorage.getItem('superAdminToken')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'I saved these codes' }));
    expect(sessionStorage.getItem('superAdminToken')).toBeNull();
    expect(mocks.navigate).toHaveBeenCalledWith('/super-admin/dashboard');
  });
});
