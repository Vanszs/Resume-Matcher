'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { apiPost, apiFetch, API_BASE } from '@/lib/api/client';

export default function LoginPage() {
    const router = useRouter();
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [registerEnabled, setRegisterEnabled] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Verification Wall State
    const [verificationMode, setVerificationMode] = useState(false);
    const [pendingUserId, setPendingUserId] = useState<string | null>(null);
    const [otpCode, setOtpCode] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);
    const [checkingSession, setCheckingSession] = useState(true);
    const [showComingSoon, setShowComingSoon] = useState<'google' | 'metamask' | null>(null);
    const [showForgotTooltip, setShowForgotTooltip] = useState(false);
    const [showEasterEgg, setShowEasterEgg] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Helper function to clear all auth credentials
    const clearAuthCredentials = () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_email');
        // Clear cookies with all possible path variations to handle edge cases
        const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
        const cookieOptions = [
            `auth_token=; path=/; max-age=0; SameSite=Lax${secure}`,
            `user_role=; path=/; max-age=0; SameSite=Lax${secure}`,
            'auth_token=; path=/; max-age=0', // Without SameSite for older browsers
            'user_role=; path=/; max-age=0',
        ];
        cookieOptions.forEach(opt => {
            document.cookie = opt;
        });
    };

    // On mount: verify existing token with the backend (5 s timeout)
    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            // Extra safety: clear any stale cookies even if no localStorage token
            clearAuthCredentials();
            setCheckingSession(false);
            return;
        }

        let cancelled = false;
        const timeoutId = setTimeout(() => {
            if (!cancelled) {
                // Timeout - clear stale credentials and show login
                clearAuthCredentials();
                setCheckingSession(false);
            }
        }, 5000);

        apiFetch('/auth/me')
            .then((res) => {
                if (cancelled) return;
                clearTimeout(timeoutId);
                if (res.ok) {
                    // Valid session — redirect to dashboard (or ?from= destination)
                    const rawFrom = new URLSearchParams(window.location.search).get('from') || '/dashboard';
                    const destination =
                        rawFrom.startsWith('/') && !rawFrom.startsWith('//')
                            ? rawFrom
                            : '/dashboard';
                    router.replace(destination);
                } else {
                    // Token invalid/expired — clear stale credentials
                    clearAuthCredentials();
                    setCheckingSession(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    clearTimeout(timeoutId);
                    // Network error or other issue — clear stale credentials
                    clearAuthCredentials();
                    setCheckingSession(false);
                }
            });

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [router]);

    // Check if registration is enabled (public endpoint, no token needed)
    useEffect(() => {
        fetch(`${API_BASE}/auth/register-status`)
            .then((r) => r.json())
            .then((d) => setRegisterEnabled(Boolean(d.enabled)))
            .catch(() => setRegisterEnabled(false));
    }, []);

    // Handle OTP Resend Cooldown Timer
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (resendCooldown > 0) {
            timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [resendCooldown]);

    // When verification wall appears, auto-start 60s cooldown
    useEffect(() => {
        if (verificationMode) {
            setResendCooldown(60);
        }
    }, [verificationMode]);

    const storeSession = (data: { access_token: string; role: string; email: string }) => {
        localStorage.setItem('auth_token', data.access_token);
        localStorage.setItem('user_role', data.role);
        localStorage.setItem('user_email', data.email);
        const maxAge = 60 * 60 * 24;
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `auth_token=${data.access_token}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
        document.cookie = `user_role=${data.role}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // 🥚 Easter egg
        if (email.trim().toLowerCase() === 'adminakunresume@gmail.com') {
            setShowEasterEgg(true);
            return;
        }

        if (mode === 'register' && password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (mode === 'register' && password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }

        setIsLoading(true);
        try {
            const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
            const response = await apiPost(endpoint, { email, password });

            if (!response.ok) {
                // Check if it's the Verification Wall trigger
                if (response.status === 403) {
                    const errData = await response.json().catch(() => ({}));
                    if (errData.detail === 'EMAIL_NOT_VERIFIED') {
                        // Backend sends the user_id in headers to use for verification
                        const userId = response.headers.get('X-User-Id');
                        if (userId) setPendingUserId(userId);

                        setVerificationMode(true);
                        setError(''); // Clear errors

                        // On LOGIN path, backend did NOT send a fresh OTP — auto-trigger resend now
                        if (mode === 'login' && userId) {
                            apiPost('/auth/resend-verification', { user_id: userId }).catch(() => null);
                        }
                        return;
                    }
                    throw new Error(errData.detail || 'Authentication failed.');
                }

                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || (mode === 'login' ? 'Login failed.' : 'Registration failed.'));
            }

            const data = await response.json();

            // After REGISTER: backend now returns { user_id, email, message } (no JWT).
            // Show the Verification Wall immediately.
            if (mode === 'register') {
                setVerificationMode(true);
                setPendingUserId(data.user_id);
                setError('');
                return;
            }

            // After LOGIN: store the session and redirect
            storeSession(data);

            // Flush the Next.js router cache so middleware re-evaluates cookies
            router.refresh();

            const rawFrom = new URLSearchParams(window.location.search).get('from') || '/dashboard';
            const destination =
                rawFrom.startsWith('/') && !rawFrom.startsWith('//')
                    ? rawFrom
                    : '/dashboard';
            router.push(destination);
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (otpCode.length !== 6) {
            setError('Please enter the 6-digit verification code.');
            return;
        }

        if (!pendingUserId) {
            setError('Session expired. Please try logging in again.');
            setVerificationMode(false);
            return;
        }

        setIsLoading(true);
        try {
            const response = await apiPost('/auth/verify-email', {
                user_id: pendingUserId,
                otp_code: otpCode
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Invalid verification code.');
            }

            // Successfully verified! Now we actually log them in
            // Re-authenticate to get a verified token session
            const loginResp = await apiPost('/auth/login', { email, password });
            if (!loginResp.ok) throw new Error('Verification succeeded but auto-login failed. Please login manually.');

            const data = await loginResp.json();
            storeSession(data);

            router.refresh();
            router.push('/dashboard');

        } catch (err: any) {
            setError(err.message || 'Failed to verify email.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendOtp = async () => {
        if (resendCooldown > 0 || !pendingUserId) return;

        setIsLoading(true);
        setError('');
        try {
            const response = await apiPost('/auth/resend-verification', {
                user_id: pendingUserId
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Failed to resend code.');
            }

            setResendCooldown(60); // 60s cooldown
            // Show temporary success state
            const previousError = error;
            setError('');

            // Just display a success alert inline
            alert('A new verification code has been sent to your email.');

        } catch (err: any) {
            setError(err.message || 'Failed to resend verification email.');
        } finally {
            setIsLoading(false);
        }
    };

    const switchMode = (next: 'login' | 'register') => {
        setMode(next);
        setError('');
        setPassword('');
        setConfirmPassword('');
    };

    const isRegister = mode === 'register';

    // Easter egg modal
    const EasterEggModal = showEasterEgg ? (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
            onClick={() => setShowEasterEgg(false)}
        >
            <div
                className="relative max-w-sm w-full bg-[#F0F0E8] border-2 border-black shadow-[8px_8px_0px_0px_#000] p-0 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top accent bar */}
                <div className="h-2 w-full bg-[#1D4ED8]" />

                {/* Header */}
                <div className="border-b border-black px-6 pt-5 pb-4 flex items-start justify-between gap-4">
                    <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#1D4ED8] mb-1">
                            // SYSTEM ALERT 🚨
                        </p>
                        <h2 className="font-serif text-xl font-black uppercase leading-tight tracking-tight">
                            INTRUSION<br />DETECTED
                        </h2>
                    </div>
                    <span className="font-mono text-4xl leading-none select-none mt-1">🕵️</span>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-3">
                    <p className="font-sans text-base font-medium leading-snug">
                        Wahh mau nyoba hack bang?
                    </p>
                    <p className="font-sans text-base font-medium leading-snug">
                        makasi ya udah mau mampir 🙏
                    </p>
                    <div className="border-l-4 border-[#1D4ED8] pl-3 mt-4">
                        <p className="font-mono text-[11px] text-gray-500 uppercase tracking-wider">
                            IP logged &bull; timestamp recorded &bull; vibe captured
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-black px-6 py-4">
                    <button
                        onClick={() => setShowEasterEgg(false)}
                        className="w-full bg-black text-white font-mono text-xs uppercase tracking-widest py-2.5 shadow-[3px_3px_0px_0px_#1D4ED8] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
                    >
                        ok ok, aku pergi deh →
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    // Show a minimal loading state while verifying existing session
    if (checkingSession) {
        return (
            <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4">
                <div className="font-mono text-xs uppercase tracking-widest text-gray-500 animate-pulse">
                    Verifying session...
                </div>
            </div>
        );
    }

    return (
        <div className="bg-[#FDFBF7] text-[#101922] font-sans h-screen flex flex-col overflow-hidden">
            {EasterEggModal}

            {/* Header / Logo Area */}
            <header className="flex p-6 md:p-10 justify-between items-center border-b-2 border-[#101922]/10 shrink-0">
                <Link href="/" className="flex items-center gap-2 select-none">
                    <span className="text-[#1D4ED8] text-3xl font-bold">✦</span>
                    <h1 className="text-xl font-extrabold tracking-tight uppercase">Resume Matcher</h1>
                </Link>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase hover:underline"
                >
                    <span>←</span>
                    Back to Home
                </Link>
            </header>

            {/* Main Form Content */}
            <main className="flex-1 flex flex-col justify-center px-6 py-4 md:py-6 overflow-y-auto">
                <div className="max-w-lg mx-auto w-full">
                    {/* Header */}
                    <div className="mb-4 md:mb-6">
                        <h2 className="font-serif text-4xl md:text-5xl font-normal text-[#101922] mb-2 tracking-tight">
                            {verificationMode ? 'Check Your Inbox.' : (isRegister ? 'Join Us.' : 'Welcome Back.')}
                        </h2>
                        <p className="text-[#101922]/60 font-medium text-base">
                            {verificationMode
                                ? `We've sent a 6-digit verification code to ${email || 'your email'}.`
                                : (isRegister
                                    ? 'Create an account to get started with Resume Matcher.'
                                    : 'Enter your credentials to access your dashboard.')}
                        </p>
                    </div>

                    {!verificationMode && (
                        <div className="flex gap-8 border-b-2 border-[#101922]/10 mb-6 items-center">
                            <button
                                type="button"
                                onClick={() => switchMode('login')}
                                className={`pb-3 border-b-4 font-mono font-bold text-base tracking-wide transition-colors ${!isRegister
                                    ? 'border-[#101922] text-[#101922]'
                                    : 'border-transparent text-[#101922]/40 hover:text-[#101922]'
                                    }`}
                            >
                                LOGIN
                            </button>
                            <button
                                type="button"
                                onClick={() => switchMode('register')}
                                disabled={!registerEnabled}
                                className={`pb-3 border-b-4 font-mono font-bold text-base tracking-wide transition-colors ${isRegister
                                    ? 'border-[#101922] text-[#101922]'
                                    : 'border-transparent text-[#101922]/40 hover:text-[#101922]'
                                    } ${!registerEnabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                            >
                                REGISTER
                            </button>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="mb-6 p-4 border-2 border-red-500 bg-red-50 rounded-none shadow-[2px_2px_0px_0px_#EF4444]">
                            <p className="font-mono text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    {/* Registration Disabled Notice */}
                    {isRegister && !registerEnabled && !verificationMode && (
                        <div className="mb-6 p-4 border-2 border-amber-500 bg-amber-50 rounded-none shadow-[2px_2px_0px_0px_#F59E0B]">
                            <p className="font-mono text-sm text-amber-700">
                                Registration is currently disabled. Please contact an administrator.
                            </p>
                        </div>
                    )}

                    {/* Verification OTP Form */}
                    {verificationMode ? (
                        <form className="flex flex-col gap-6" onSubmit={handleVerifyOtp}>
                            <div className="flex flex-col gap-2">
                                <label className="font-mono text-sm font-bold uppercase tracking-wider text-[#101922]">
                                    6-Digit Verification Code
                                </label>
                                <input
                                    type="text"
                                    maxLength={6}
                                    value={otpCode}
                                    onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                                    className="w-full h-16 bg-white border-4 border-[#101922] rounded-none px-4 font-mono text-2xl tracking-[0.5em] text-center placeholder:text-gray-300 focus:outline-none focus:ring-0 focus:shadow-[4px_4px_0px_0px_#1D4ED8] transition-all uppercase"
                                    placeholder="000000"
                                    autoComplete="one-time-code"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || otpCode.length !== 6}
                                className="mt-2 w-full h-14 bg-[#1D4ED8] text-white border-2 border-[#101922] rounded-none font-bold text-base flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_#101922] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#101922] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? 'Verifying...' : 'Verify Email ✦'}
                            </button>

                            <div className="flex items-center justify-between mt-4">
                                <button
                                    type="button"
                                    onClick={() => setVerificationMode(false)}
                                    className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-[#1D4ED8] transition-colors"
                                >
                                    ← Back to Login
                                </button>

                                <button
                                    type="button"
                                    onClick={handleResendOtp}
                                    disabled={resendCooldown > 0 || isLoading}
                                    className={`font-mono text-xs font-bold uppercase tracking-wider transition-colors ${resendCooldown > 0
                                        ? 'text-gray-400 cursor-not-allowed'
                                        : 'text-[#101922] hover:text-[#1D4ED8] underline decoration-2'
                                        }`}
                                >
                                    {resendCooldown > 0
                                        ? `Resend available in ${resendCooldown}s`
                                        : 'Resend Code'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        /* Login / Register Form */
                        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
                            {/* Email Input */}
                            <div className="flex flex-col gap-2">
                                <label className="font-mono text-sm font-bold uppercase tracking-wider text-[#101922]">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full h-14 bg-white border-2 border-[#101922] rounded-lg px-4 font-medium placeholder:text-gray-400 focus:outline-none focus:ring-0 focus:shadow-[4px_4px_0px_0px_#101922] transition-shadow"
                                    placeholder="name@example.com"
                                    required
                                />
                            </div>

                            {/* Password Input */}
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-end">
                                    <label className="font-mono text-sm font-bold uppercase tracking-wider text-[#101922]">
                                        Password
                                    </label>
                                    {!isRegister && (
                                        <div className="relative">
                                            <a
                                                href="#"
                                                className="text-xs font-mono font-bold underline decoration-2 decoration-[#1D4ED8]/50 hover:decoration-[#1D4ED8]"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setShowForgotTooltip(true);
                                                    setTimeout(() => setShowForgotTooltip(false), 3000);
                                                }}
                                            >
                                                Forgot?
                                            </a>
                                            {showForgotTooltip && (
                                                <div className="absolute -top-16 right-0 md:left-1/2 md:-translate-x-1/2 md:right-auto bg-[#101922] text-white px-3 py-2 rounded text-xs font-mono shadow-lg z-50 w-48 text-center leading-relaxed">
                                                    we dont have this feature rn, just make a new account :D
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full h-14 bg-white border-2 border-[#101922] rounded-lg px-4 pr-12 font-medium placeholder:text-gray-400 focus:outline-none focus:ring-0 focus:shadow-[4px_4px_0px_0px_#101922] transition-shadow"
                                        placeholder="********"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#101922] transition-colors p-1"
                                        tabIndex={-1}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            {/* Confirm Password Input (Register only) */}
                            {isRegister && (
                                <div className="flex flex-col gap-2">
                                    <label className="font-mono text-sm font-bold uppercase tracking-wider text-[#101922]">
                                        Confirm Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full h-14 bg-white border-2 border-[#101922] rounded-lg px-4 pr-12 font-medium placeholder:text-gray-400 focus:outline-none focus:ring-0 focus:shadow-[4px_4px_0px_0px_#101922] transition-shadow"
                                            placeholder="********"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#101922] transition-colors p-1"
                                            tabIndex={-1}
                                            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Primary CTA */}
                            <button
                                type="submit"
                                disabled={isLoading || (isRegister && !registerEnabled)}
                                className="mt-4 w-full h-14 bg-[#1D4ED8] text-white border-2 border-[#101922] rounded-lg font-bold text-base flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_#101922] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#101922] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_0px_#101922]"
                            >
                                {isLoading ? (
                                    <span>Processing...</span>
                                ) : (
                                    <>
                                        Continue
                                        <span>→</span>
                                    </>
                                )}
                            </button>

                            {/* Divider */}
                            {!isRegister && (
                                <>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 h-px bg-[#101922]/10" />
                                        <span className="font-mono text-xs text-[#101922]/40 uppercase tracking-wider">or</span>
                                        <div className="flex-1 h-px bg-[#101922]/10" />
                                    </div>

                                    {/* Social / Web3 Login */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Google Button */}
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onMouseEnter={() => setShowComingSoon('google')}
                                                onMouseLeave={() => setShowComingSoon(null)}
                                                className="w-full h-12 bg-white border-2 border-[#101922] rounded-lg flex items-center justify-center gap-3 font-bold shadow-[4px_4px_0px_0px_#101922] hover:shadow-[2px_2px_0px_0px_#101922] hover:translate-x-[2px] hover:translate-y-[2px] transition-all active:shadow-none active:translate-x-[4px] active:translate-y-[4px] cursor-not-allowed opacity-70"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src="https://www.google.com/favicon.ico"
                                                    alt="Google Logo"
                                                    className="w-5 h-5"
                                                />
                                                <span className="font-mono text-sm font-bold">Google</span>
                                            </button>
                                            {showComingSoon === 'google' && (
                                                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-[#101922] text-white px-3 py-1 rounded text-xs font-mono whitespace-nowrap z-10">
                                                    Coming Soon
                                                </div>
                                            )}
                                        </div>

                                        {/* MetaMask Button */}
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onMouseEnter={() => setShowComingSoon('metamask')}
                                                onMouseLeave={() => setShowComingSoon(null)}
                                                className="w-full h-12 bg-white border-2 border-[#101922] rounded-lg flex items-center justify-center gap-3 font-bold shadow-[4px_4px_0px_0px_#101922] hover:shadow-[2px_2px_0px_0px_#101922] hover:translate-x-[2px] hover:translate-y-[2px] transition-all active:shadow-none active:translate-x-[4px] active:translate-y-[4px] cursor-not-allowed opacity-70"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg"
                                                    alt="MetaMask Logo"
                                                    className="w-5 h-5"
                                                />
                                                <span className="font-mono text-sm font-bold">MetaMask</span>
                                            </button>
                                            {showComingSoon === 'metamask' && (
                                                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-[#101922] text-white px-3 py-1 rounded text-xs font-mono whitespace-nowrap z-10">
                                                    Coming Soon
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </form>
                    )}
                </div>
            </main>
        </div>
    );
}
