import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { getErrorMessage } from '../../utils/errors';

const ActivationForm: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 12) return setError('Password must be at least 12 characters.');
    if (password !== confirmation) return setError('Passwords do not match.');
    setLoading(true);
    setError('');
    try {
      await api.postPublic<{ activated: true }>('/auth/activate', { token, password });
      setActivated(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'This activation link is invalid or expired.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        {activated ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-emerald-600" />
            <h1 className="text-2xl font-bold">Account activated</h1>
            <p className="mt-2 text-slate-600">Your password is set and restaurant access is ready.</p>
            <Link to="/" className="mt-6 inline-block rounded-lg bg-emerald-700 px-5 py-3 font-medium text-white">Continue to sign in</Link>
          </div>
        ) : (
          <>
            <KeyRound className="mb-4 h-12 w-12 text-emerald-700" />
            <h1 className="text-2xl font-bold">Activate restaurant owner account</h1>
            <p className="mt-2 text-sm text-slate-600">Choose a password. This invitation can be used only once.</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div><label htmlFor="activation-password" className="mb-1 block text-sm font-medium">Password</label><input id="activation-password" type="password" required minLength={12} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></div>
              <div><label htmlFor="activation-confirmation" className="mb-1 block text-sm font-medium">Confirm password</label><input id="activation-confirmation" type="password" required minLength={12} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></div>
              {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={loading || !token} className="flex w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Activate account'}</button>
            </form>
            {!token && <p role="alert" className="mt-4 text-sm text-red-700">The activation token is missing.</p>}
          </>
        )}
      </section>
    </main>
  );
};

export default ActivationForm;
