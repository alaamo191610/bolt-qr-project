import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

const BrokenMenu = () => {
  throw new Error('test render failure');
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('contains a customer render error and offers recovery without exposing internals', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();

    render(
      <ErrorBoundary scope="customer">
        <BrokenMenu />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('We could not load the menu');
    expect(screen.queryByText('test render failure')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('uses independent admin recovery copy', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary scope="admin">
        <BrokenMenu />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('We could not load this workspace');
  });
});
