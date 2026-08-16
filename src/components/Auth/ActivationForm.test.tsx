import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../services/api';
import ActivationForm from './ActivationForm';

afterEach(() => vi.restoreAllMocks());

describe('ActivationForm', () => {
  it('sets the invited owner password and shows the login handoff', async () => {
    const activation = vi.spyOn(api, 'postPublic').mockResolvedValue({ activated: true });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/activate?token=invitation-secret']}><ActivationForm /></MemoryRouter>);

    await user.type(screen.getByLabelText('Password'), 'Owner-password-123!');
    await user.type(screen.getByLabelText('Confirm password'), 'Owner-password-123!');
    await user.click(screen.getByRole('button', { name: 'Activate account' }));

    expect(activation).toHaveBeenCalledWith('/auth/activate', {
      token: 'invitation-secret',
      password: 'Owner-password-123!',
    });
    expect(await screen.findByRole('heading', { name: 'Account activated' })).toBeInTheDocument();
  });

  it('rejects mismatched passwords before making a request', async () => {
    const activation = vi.spyOn(api, 'postPublic');
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/activate?token=invitation-secret']}><ActivationForm /></MemoryRouter>);
    await user.type(screen.getByLabelText('Password'), 'Owner-password-123!');
    await user.type(screen.getByLabelText('Confirm password'), 'Different-password!');
    await user.click(screen.getByRole('button', { name: 'Activate account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(activation).not.toHaveBeenCalled();
  });
});
