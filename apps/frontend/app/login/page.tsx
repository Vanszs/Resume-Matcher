'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiPost } from '@/lib/api/client';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const response = await apiPost('/auth/login', { email, password });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Login failed. Please check your credentials.');
            }

            const data = await response.json();

            // Store in localStorage (used by API client for Bearer headers)
            localStorage.setItem('auth_token', data.access_token);
            localStorage.setItem('user_role', data.role);
            localStorage.setItem('user_email', data.email);

            // Also set cookies so the Next.js middleware can gate page access
            // server-side (HttpOnly is NOT set so JS can also clear them on logout)
            const maxAge = 60 * 60 * 24; // 24 hours
            document.cookie = `auth_token=${data.access_token}; path=/; max-age=${maxAge}; SameSite=Lax`;
            document.cookie = `user_role=${data.role}; path=/; max-age=${maxAge}; SameSite=Lax`;

            // Redirect to originally requested page, or dashboard
            const params = new URLSearchParams(window.location.search);
            router.push(params.get('from') || '/dashboard');

        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Abstract shape for Brutalist vibe */}
                <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-accent/20 rounded-full blur-3xl -z-10 blur-mix" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-alt/10 rounded-full blur-3xl -z-10" />

                <Card className="border-2 border-ink shadow-sw-default bg-canvas relative z-10 w-full transform transition-all hover:-translate-y-1 hover:-translate-x-1 duration-300">
                    <CardHeader>
                        <CardTitle className="text-3xl font-serif text-ink tracking-tight uppercase">Login</CardTitle>
                        <CardDescription className="text-sm font-mono text-gray-600 mt-2">
                            ACCESS YOUR WORKSPACE
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-6">
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
                                    placeholder="admin@example.com"
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

                            <div className="pt-4">
                                <Button
                                    type="submit"
                                    className="w-full uppercase font-mono tracking-wider"
                                    disabled={isLoading}
                                    variant="default"
                                >
                                    {isLoading ? 'AUTHENTICATING...' : 'ENTER'}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
