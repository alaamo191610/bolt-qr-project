import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Lock, Mail, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    superAdminService,
    type SuperAdminMfaChallenge,
    type SuperAdminSession,
} from '../../services/superAdminService';
import { getErrorMessage } from '../../utils/errors';

const SuperAdminLogin: React.FC = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [challenge, setChallenge] = useState<SuperAdminMfaChallenge | null>(null);
    const [verificationCode, setVerificationCode] = useState('');
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);
    const [pendingSession, setPendingSession] = useState<SuperAdminSession | null>(null);
    const [loading, setLoading] = useState(false);

    const finishLogin = (session: SuperAdminSession) => {
        toast.success(`Welcome, ${session.user.name || 'Super Admin'}!`);
        navigate('/super-admin/dashboard');
    };

    const handlePassword = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!email || !password) {
            toast.error('Please enter email and password');
            return;
        }
        setLoading(true);
        try {
            setChallenge(await superAdminService.login(email, password));
            setVerificationCode('');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Login failed. Please try again.'));
        } finally {
            setLoading(false);
        }
    };

    const handleMfa = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!challenge || !verificationCode.trim()) {
            toast.error(useRecoveryCode ? 'Enter a recovery code' : 'Enter the six-digit authenticator code');
            return;
        }
        setLoading(true);
        try {
            const session = await superAdminService.verifyMfa(
                challenge.challengeToken,
                verificationCode,
                useRecoveryCode,
            );
            if (session.recoveryCodes?.length) setPendingSession(session);
            else finishLogin(session);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Verification failed. Please try again.'));
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setChallenge(null);
        setVerificationCode('');
        setUseRecoveryCode(false);
        setPendingSession(null);
        setPassword('');
    };

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000" />
            </div>

            <div className="relative w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl shadow-2xl mb-4">
                        <Shield className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-4xl font-bold text-white mb-2">Super Admin</h1>
                    <p className="text-purple-200">Protected by password and authenticator MFA</p>
                </div>

                <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20">
                    {!challenge && !pendingSession && (
                        <form onSubmit={handlePassword} className="space-y-6">
                            <label className="block text-sm font-medium text-purple-200">
                                Email Address
                                <span className="relative block mt-2">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-300" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={event => setEmail(event.target.value)}
                                        className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        placeholder="admin@example.com"
                                        autoComplete="username"
                                        autoFocus
                                    />
                                </span>
                            </label>
                            <label className="block text-sm font-medium text-purple-200">
                                Password
                                <span className="relative block mt-2">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-300" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={event => setPassword(event.target.value)}
                                        className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        placeholder="Enter your password"
                                        autoComplete="current-password"
                                    />
                                </span>
                            </label>
                            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50">
                                {loading ? 'Checking…' : 'Continue'}
                            </button>
                        </form>
                    )}

                    {challenge && !pendingSession && (
                        <form onSubmit={handleMfa} className="space-y-5">
                            <div className="text-purple-100">
                                <h2 className="text-xl font-semibold text-white">
                                    {challenge.enrollmentRequired ? 'Set up your authenticator' : 'Verify your authenticator'}
                                </h2>
                                {challenge.enrollment && (
                                    <div className="mt-3 rounded-lg bg-black/20 p-3 text-sm">
                                        <p>In your authenticator app, add an account using this setup key:</p>
                                        <code className="mt-2 block break-all select-all text-white" data-testid="mfa-secret">
                                            {challenge.enrollment.secret}
                                        </code>
                                    </div>
                                )}
                            </div>
                            <label className="block text-sm font-medium text-purple-200">
                                {useRecoveryCode ? 'Recovery code' : 'Six-digit code'}
                                <span className="relative block mt-2">
                                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-300" />
                                    <input
                                        value={verificationCode}
                                        onChange={event => setVerificationCode(event.target.value)}
                                        inputMode={useRecoveryCode ? 'text' : 'numeric'}
                                        autoComplete="one-time-code"
                                        className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        placeholder={useRecoveryCode ? 'XXXXX-XXXXX-XXXXX-XXXXX' : '123456'}
                                        autoFocus
                                    />
                                </span>
                            </label>
                            {!challenge.enrollmentRequired && (
                                <button type="button" onClick={() => { setUseRecoveryCode(value => !value); setVerificationCode(''); }} className="text-sm text-purple-200 underline">
                                    {useRecoveryCode ? 'Use authenticator code' : 'Use a recovery code'}
                                </button>
                            )}
                            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50">
                                {loading ? 'Verifying…' : 'Verify and sign in'}
                            </button>
                            <button type="button" onClick={reset} className="w-full text-sm text-purple-200">Start again</button>
                        </form>
                    )}

                    {pendingSession?.recoveryCodes && (
                        <div className="space-y-5 text-purple-100">
                            <div>
                                <h2 className="text-xl font-semibold text-white">Save your recovery codes</h2>
                                <p className="mt-2 text-sm">Each code works once. Store them offline; they will not be shown again.</p>
                            </div>
                            <pre className="rounded-lg bg-black/30 p-4 text-sm text-white whitespace-pre-wrap select-all" data-testid="recovery-codes">
                                {pendingSession.recoveryCodes.join('\n')}
                            </pre>
                            <button type="button" onClick={() => finishLogin(pendingSession)} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-xl font-semibold">
                                I saved these codes
                            </button>
                        </div>
                    )}

                    <div className="mt-6 pt-6 border-t border-white/10">
                        <p className="text-xs text-purple-200 text-center">Sessions expire after 30 minutes and are not stored across browser restarts.</p>
                    </div>
                </div>

                <div className="text-center mt-6">
                    <button onClick={() => navigate('/')} className="text-purple-200 hover:text-white transition-colors text-sm">
                        ← Back to Restaurant Dashboard
                    </button>
                </div>
            </div>
        </main>
    );
};

export default SuperAdminLogin;
