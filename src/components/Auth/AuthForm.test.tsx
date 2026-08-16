import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthForm from './AuthForm';

const translations: Record<string, string> = {
  'auth.welcome': 'Welcome Back',
  'auth.signInDescription': 'Sign in to your restaurant dashboard',
  'auth.email': 'Email Address',
  'auth.emailPlaceholder': 'admin@restaurant.com',
  'auth.password': 'Password',
  'auth.passwordPlaceholder': '********',
  'auth.signIn': 'Sign In',
};

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => translations[key] ?? key }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const signIn = vi.fn();
vi.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ signIn, user: null }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuthForm', () => {
  it('does not show a restaurant name field while signing in', () => {
    render(<AuthForm />);
    expect(screen.queryByLabelText('Restaurant Name')).not.toBeInTheDocument();
  });

  it('submits restaurant login without exposing public signup', async () => {
    const user = userEvent.setup();
    render(<AuthForm />);

    await user.type(screen.getByLabelText('Email Address'), 'owner@bellavista.com');
    await user.type(screen.getByLabelText('Password'), 'a-real-password');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(signIn).toHaveBeenCalledWith('owner@bellavista.com', 'a-real-password');
    expect(screen.queryByText(/sign up/iu)).not.toBeInTheDocument();
  });

  it('explains that access is controlled by the platform administrator', () => {
    render(<AuthForm />);
    expect(screen.getByText(/invitation-only/iu)).toBeInTheDocument();
  });
});
