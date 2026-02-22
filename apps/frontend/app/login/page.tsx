'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
    const [checkingSession, setCheckingSession] = useState(true);
    const [showComingSoon, setShowComingSoon] = useState<'google' | 'metamask' | null>(null);
    const [showForgotTooltip, setShowForgotTooltip] = useState(false);

    // Helper function to clear all auth credentials
    const clearAuthCredentials = () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_email');
        // Clear cookies with all possible path variations to handle edge cases
        const cookieOptions = [
            'auth_token=; path=/; max-age=0; SameSite=Lax',
            'user_role=; path=/; max-age=0; SameSite=Lax',
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

    const storeSession = (data: { access_token: string; role: string; email: string }) => {
        localStorage.setItem('auth_token', data.access_token);
        localStorage.setItem('user_role', data.role);
        localStorage.setItem('user_email', data.email);
        const maxAge = 60 * 60 * 24;
        document.cookie = `auth_token=${data.access_token}; path=/; max-age=${maxAge}; SameSite=Lax`;
        document.cookie = `user_role=${data.role}; path=/; max-age=${maxAge}; SameSite=Lax`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

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
                const errData = await response.json();
                throw new Error(errData.detail || (mode === 'login' ? 'Login failed.' : 'Registration failed.'));
            }

            const data = await response.json();
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

    const switchMode = (next: 'login' | 'register') => {
        setMode(next);
        setError('');
        setPassword('');
        setConfirmPassword('');
    };

    const isRegister = mode === 'register';

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
        <div className="bg-[#FDFBF7] text-[#101922] font-sans h-screen flex flex-col md:flex-row overflow-hidden">
            {/* Left Panel: Artistic Collage */}
            <div className="relative hidden md:flex w-1/2 flex-col justify-between border-r-4 border-[#101922] bg-[#FF5C00] p-8 lg:p-12 overflow-hidden h-screen">
                {/* Abstract Shapes / Collage Elements */}
                <div 
                    className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none" 
                    style={{
                        backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
                        backgroundSize: '20px 20px'
                    }}
                />
                
                <div className="relative z-10 flex flex-col h-full justify-center items-center">
                    {/* Collage Container */}
                    <div className="relative w-[450px] h-[550px] border-4 border-[#101922] bg-[#FDFBF7] shadow-[6px_6px_0px_0px_#101922] rotate-[-2deg] overflow-hidden">
                        {/* Image */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/portrait-person-with-collage-technique-color-blocking%20(1).webp"
                            alt="Resume Matcher Hero"
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => {
                                // Fallback gradient if image fails to load
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement!.style.background = 'linear-gradient(135deg, #FF5C00 0%, #1D4ED8 100%)';
                            }}
                        />
                        
                        {/* Decorative elements overlay */}
                        <div className="absolute -top-12 -right-12 w-24 h-24 bg-[#1D4ED8] rounded-full border-4 border-[#101922] z-20" />
                        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-yellow-400 border-4 border-[#101922] z-20 flex items-center justify-center">
                            {/* Target/Search Icon */}
                            <svg className="w-12 h-12 text-[#101922]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="9" />
                                <circle cx="12" cy="12" r="3" fill="currentColor" />
                                <line x1="12" y1="3" x2="12" y2="9" />
                                <line x1="12" y1="15" x2="12" y2="21" />
                                <line x1="3" y1="12" x2="9" y2="12" />
                                <line x1="15" y1="12" x2="21" y2="12" />
                            </svg>
                        </div>
                        
                        {/* Sticker */}
                        <div className="absolute top-4 right-4 bg-white border-2 border-[#101922] px-2 py-1 rotate-12 shadow-[2px_2px_0px_0px_#101922]">
                            <p className="font-mono text-xs font-bold uppercase tracking-tighter">Verified</p>
                        </div>
                    </div>
                    
                    <div className="mt-16 text-center max-w-md">
                        <h2 className="font-serif text-4xl font-bold leading-tight mb-4 text-[#101922]">
                            Find your path.
                        </h2>
                        <p className="font-mono text-sm font-medium border-l-4 border-[#101922] pl-4 text-left ml-8 bg-white/50 p-2">
                            Connect with opportunities that define your future. Join the network of professionals building the new web.
                        </p>
                    </div>
                </div>
                
                {/* Decorative corner */}
                <div className="absolute bottom-8 left-8">
                    <svg className="text-[#101922]" fill="none" height="64" viewBox="0 0 64 64" width="64" xmlns="http://www.w3.org/2000/svg">
                        <path d="M32 0V64M0 32H64" stroke="currentColor" strokeWidth="4" />
                    </svg>
                </div>
            </div>

            {/* Right Panel: Auth Form */}
            <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-[#FDFBF7] relative">
                {/* Header / Logo Area */}
                <header className="hidden md:flex p-6 md:p-10 justify-between items-center border-b-2 border-[#101922]/10">
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
                <main className="flex-1 flex flex-col justify-center px-6 py-4 md:py-6 sm:px-12 lg:px-20 max-w-2xl mx-auto w-full">
                    <div className="mb-4 md:mb-6">
                        <h2 className="font-serif text-4xl md:text-5xl font-normal text-[#101922] mb-2 tracking-tight">
                            {isRegister ? 'Join Us.' : 'Welcome Back.'}
                        </h2>
                        <p className="text-[#101922]/60 font-medium text-base">
                            {isRegister 
                                ? 'Create an account to get started with Resume Matcher.' 
                                : 'Enter your credentials to access your dashboard.'}
                        </p>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-8 border-b-2 border-[#101922]/10 mb-6 items-center">
                        <button
                            type="button"
                            onClick={() => switchMode('login')}
                            className={`pb-3 border-b-4 font-mono font-bold text-base tracking-wide transition-colors ${
                                !isRegister 
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
                            className={`pb-3 border-b-4 font-mono font-bold text-base tracking-wide transition-colors ${
                                isRegister 
                                    ? 'border-[#101922] text-[#101922]' 
                                    : 'border-transparent text-[#101922]/40 hover:text-[#101922]'
                            } ${!registerEnabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                        >
                            REGISTER
                        </button>
                        <Link 
                            href="/" 
                            className="md:hidden ml-auto inline-flex items-center gap-1 font-mono text-xs font-bold uppercase hover:underline text-[#101922] pb-3"
                        >
                            <span>←</span>
                            Back
                        </Link>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-6 p-4 border-2 border-red-500 bg-red-50 rounded-lg">
                            <p className="font-mono text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    {/* Registration Disabled Notice */}
                    {isRegister && !registerEnabled && (
                        <div className="mb-6 p-4 border-2 border-amber-500 bg-amber-50 rounded-lg">
                            <p className="font-mono text-sm text-amber-700">
                                Registration is currently disabled. Please contact an administrator.
                            </p>
                        </div>
                    )}

                    {/* Form */}
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
                                            <div className="absolute -top-14 right-0 bg-[#101922] text-white px-3 py-2 rounded text-xs font-mono whitespace-nowrap shadow-lg z-50 max-w-[200px] text-center">
                                                We don't have this feature yet, just make a new account :D
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full h-14 bg-white border-2 border-[#101922] rounded-lg px-4 font-medium placeholder:text-gray-400 focus:outline-none focus:ring-0 focus:shadow-[4px_4px_0px_0px_#101922] transition-shadow"
                                placeholder="********"
                                required
                            />
                        </div>

                        {/* Confirm Password Input (Register only) */}
                        {isRegister && (
                            <div className="flex flex-col gap-2">
                                <label className="font-mono text-sm font-bold uppercase tracking-wider text-[#101922]">
                                    Confirm Password
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full h-14 bg-white border-2 border-[#101922] rounded-lg px-4 font-medium placeholder:text-gray-400 focus:outline-none focus:ring-0 focus:shadow-[4px_4px_0px_0px_#101922] transition-shadow"
                                    placeholder="********"
                                    required
                                />
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
                    </form>

                    {/* Divider */}
                    <div className="relative my-6 flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t-2 border-[#101922]/10" />
                        </div>
                        <div className="relative bg-[#FDFBF7] px-4">
                            <span className="font-mono text-xs font-bold text-[#101922]/50 uppercase bg-[#FDFBF7] px-2 border-2 border-[#101922]/10 rounded">
                                Or sign in with
                            </span>
                        </div>
                    </div>

                    {/* Social / Web3 Login */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                    src="/Logo-google-icon-PNG.png" 
                                    alt="Google Logo" 
                                    className="w-5 h-5"
                                />
                                <span>Google</span>
                            </button>
                            {showComingSoon === 'google' && (
                                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-[#101922] text-white px-3 py-1 rounded text-xs font-mono whitespace-nowrap">
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
                                className="w-full h-12 bg-[#F6851B] text-white border-2 border-[#101922] rounded-lg flex items-center justify-center gap-3 font-bold shadow-[4px_4px_0px_0px_#101922] hover:shadow-[2px_2px_0px_0px_#101922] hover:translate-x-[2px] hover:translate-y-[2px] transition-all active:shadow-none active:translate-x-[4px] active:translate-y-[4px] cursor-not-allowed opacity-70"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img 
                                    src="/MetaMask-icon-fox.svg" 
                                    alt="MetaMask Logo" 
                                    className="w-5 h-5"
                                />
                                <span>MetaMask</span>
                            </button>
                            {showComingSoon === 'metamask' && (
                                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-[#101922] text-white px-3 py-1 rounded text-xs font-mono whitespace-nowrap">
                                    Coming Soon
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
