import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthForm from './AuthForm';

const translations: Record<string, string> = {
  'auth.welcome': 'Welcome Back',
  'auth.createAccount': 'Create Account',
  'auth.signInDescription': 'Sign in to your restaurant dashboard',
  'auth.signUpDescription': 'Set up your restaurant account',
  'auth.restaurantName': 'Restaurant Name',
  'auth.restaurantNamePlaceholder': 'Bella Vista',
  'auth.email': 'Email Address',
  'auth.emailPlaceholder': 'admin@restaurant.com',
  'auth.password': 'Password',
  'auth.passwordPlaceholder': '********',
  'auth.passwordHint': 'At least 8 characters',
  'auth.passwordTooShort': 'Password must be at least 8 characters',
  'auth.signIn': 'Sign In',
  'auth.signUp': 'Sign Up',
  'auth.alreadyHaveAccount': 'Already have an account? Sign in',
  'auth.dontHaveAccount': "Don't have an account? Sign up",
};

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => translations[key] ?? key }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const signUp = vi.fn();
const signIn = vi.fn();
vi.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ signIn, signUp, user: null }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuthForm', () => {
  it('does not show a restaurant name field while signing in', () => {
    render(<AuthForm />);
    expect(screen.queryByLabelText('Restaurant Name')).not.toBeInTheDocument();
  });

  it('shows a restaurant name field after switching to sign up and submits it', async () => {
    const user = userEvent.setup();
    render(<AuthForm />);

    await user.click(screen.getByText("Don't have an account? Sign up"));
    expect(screen.getByLabelText('Restaurant Name')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Restaurant Name'), 'Bella Vista');
    await user.type(screen.getByLabelText('Email Address'), 'owner@bellavista.com');
    await user.type(screen.getByLabelText('Password'), 'a-real-password');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(signUp).toHaveBeenCalledWith('owner@bellavista.com', 'a-real-password', 'Bella Vista');
  });

  it('blocks submission with an inline message when the sign-up password is too short', async () => {
    const user = userEvent.setup();
    render(<AuthForm />);

    await user.click(screen.getByText("Don't have an account? Sign up"));
    await user.type(screen.getByLabelText('Restaurant Name'), 'Bella Vista');
    await user.type(screen.getByLabelText('Email Address'), 'owner@bellavista.com');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });
});
