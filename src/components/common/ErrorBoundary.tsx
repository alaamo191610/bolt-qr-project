import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
  scope: 'customer' | 'admin';
};

type ErrorBoundaryState = {
  error: Error | null;
};

const copyByScope = {
  customer: {
    title: 'We could not load the menu',
    body: 'Please try again. If the problem continues, ask restaurant staff for help.',
  },
  admin: {
    title: 'We could not load this workspace',
    body: 'Please try again. If the problem continues, sign in again or contact support.',
  },
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Hosted error reporting is added in M3. Do not send user data or component props here.
    console.error('React render failure', {
      scope: this.props.scope,
      message: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const copy = copyByScope[this.props.scope];
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6" role="alert">
        <section className="max-w-md rounded-xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">{copy.title}</h1>
          <p className="mt-2 text-slate-600">{copy.body}</p>
          <button
            type="button"
            onClick={this.retry}
            className="mt-5 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }
}
