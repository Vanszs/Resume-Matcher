'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

    // On mount: verify existing token with the backend (5 s timeout)
    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            setCheckingSession(false);
            return;
        }

        let cancelled = false;
        const timeoutId = setTimeout(() => {
            if (!cancelled) setCheckingSession(false);
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
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('user_role');
                    localStorage.removeItem('user_email');
                    document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
                    document.cookie = 'user_role=; path=/; max-age=0; SameSite=Lax';
                    setCheckingSession(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    clearTimeout(timeoutId);
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
            <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
                <div className="font-mono text-xs uppercase tracking-widest text-gray-500 animate-pulse">
                    Verifying session...
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-accent/20 rounded-full blur-3xl -z-10 blur-mix" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-alt/10 rounded-full blur-3xl -z-10" />

                <Card className="border-2 border-ink shadow-sw-default bg-canvas relative z-10 w-full transform transition-all hover:-translate-y-1 hover:-translate-x-1 duration-300">
                    <CardHeader>
                        {/* Mode tabs */}
                        {registerEnabled && (
                            <div className="flex border-2 border-ink mb-4">
                                <button
                                    type="button"
                                    onClick={() => switchMode('login')}
                                    className={`flex-1 py-2 font-mono text-xs uppercase tracking-widest transition-colors ${
                                        !isRegister
                                            ? 'bg-ink text-canvas'
                                            : 'bg-canvas text-ink hover:bg-[#E5E5E0]'
                                    }`}
                                >
                                    Login
                                </button>
                                <button
                                    type="button"
                                    onClick={() => switchMode('register')}
                                    className={`flex-1 py-2 font-mono text-xs uppercase tracking-widest border-l-2 border-ink transition-colors ${
                                        isRegister
                                            ? 'bg-ink text-canvas'
                                            : 'bg-canvas text-ink hover:bg-[#E5E5E0]'
                                    }`}
                                >
                                    Register
                                </button>
                            </div>
                        )}
                        <CardTitle className="text-3xl font-serif text-ink tracking-tight uppercase">
                            {isRegister ? 'Create Account' : 'Login'}
                        </CardTitle>
                        <CardDescription className="text-sm font-mono text-gray-600 mt-2">
                            {isRegister ? 'REGISTER A NEW ACCOUNT' : 'ACCESS YOUR WORKSPACE'}
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="p-3 border-2 border-red-500 bg-red-50 text-red-700 font-mono text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="email" className="font-mono text-xs uppercase tracking-widest text-gray-500">Email Address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    required
                                    className="font-mono rounded-none border-2 border-ink focus:ring-0 focus:border-accent"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password" className="font-mono text-xs uppercase tracking-widest text-gray-500">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    className="font-mono rounded-none border-2 border-ink focus:ring-0 focus:border-accent"
                                />
                            </div>

                            {isRegister && (
                                <div className="space-y-2">
                                    <Label htmlFor="confirmPassword" className="font-mono text-xs uppercase tracking-widest text-gray-500">Confirm Password</Label>
                                    <Input
                                        id="confirmPassword"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="font-mono rounded-none border-2 border-ink focus:ring-0 focus:border-accent"
                                    />
                                </div>
                            )}

                            <div className="pt-4">
                                <Button
                                    type="submit"
                                    className="w-full uppercase font-mono tracking-wider"
                                    disabled={isLoading}
                                    variant="default"
                                >
                                    {isLoading
                                        ? (isRegister ? 'CREATING ACCOUNT...' : 'AUTHENTICATING...')
                                        : (isRegister ? 'CREATE ACCOUNT' : 'ENTER')}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
