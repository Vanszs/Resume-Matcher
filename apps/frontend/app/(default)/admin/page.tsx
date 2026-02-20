'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { apiFetch, apiPost, apiDelete } from '@/lib/api/client';
import {
    ArrowLeft,
    Users,
    Shield,
    Plus,
    Loader2,
    CheckCircle2,
    XCircle,
    UserPlus,
    Trash2,
    ToggleLeft,
    ToggleRight,
} from 'lucide-react';

type UserEntry = {
    id: string;
    email: string;
    username: string;
    is_active: boolean;
    role_name: string;
    created_at: string;
};

type RoleEntry = {
    id: string;
    name: string;
    permissions: string;
};

type Status = 'idle' | 'loading' | 'saving' | 'error';

export default function AdminPage() {
    const [users, setUsers] = useState<UserEntry[]>([]);
    const [roles, setRoles] = useState<RoleEntry[]>([]);
    const [status, setStatus] = useState<Status>('loading');
    const [error, setError] = useState<string | null>(null);

    // Add user form
    const [showAddUser, setShowAddUser] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRoleId, setNewRoleId] = useState('');
    const [addingUser, setAddingUser] = useState(false);

    // App settings
    const [registerEnabled, setRegisterEnabled] = useState(false);
    const [togglingRegister, setTogglingRegister] = useState(false);

    // Feedback
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setStatus('loading');
        setError(null);
        try {
            const [usersRes, rolesRes, appSettingsRes] = await Promise.all([
                apiFetch('/admin/users'),
                apiFetch('/admin/roles'),
                apiFetch('/admin/app-settings'),
            ]);

            if (usersRes.status === 403) {
                setError('You do not have admin privileges to access this page.');
                setStatus('error');
                return;
            }

            if (!usersRes.ok || !rolesRes.ok) {
                throw new Error('Failed to load admin data');
            }

            const usersData = await usersRes.json();
            const rolesData = await rolesRes.json();

            setUsers(usersData);
            setRoles(rolesData);
            if (rolesData.length > 0 && !newRoleId) {
                setNewRoleId(rolesData[0].id);
            }
            if (appSettingsRes.ok) {
                const appSettings = await appSettingsRes.json();
                setRegisterEnabled(Boolean(appSettings.register_enabled));
            }
            setStatus('idle');
        } catch (err) {
            console.error('Failed to load admin data:', err);
            setError('Unable to connect to the backend. Is the server running?');
            setStatus('error');
        }
    }

    async function handleAddUser(e: React.FormEvent) {
        e.preventDefault();
        setAddingUser(true);
        setFeedback(null);

        try {
            const res = await apiPost('/admin/users', {
                email: newEmail,
                username: newUsername,
                password: newPassword,
                role_id: newRoleId,
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || 'Failed to create user');
            }

            // Reset form
            setNewEmail('');
            setNewUsername('');
            setNewPassword('');
            setShowAddUser(false);
            setFeedback({ type: 'success', message: 'User created successfully' });

            // Reload users
            await loadData();
        } catch (err: any) {
            setFeedback({ type: 'error', message: err.message || 'Failed to create user' });
        } finally {
            setAddingUser(false);
        }
    }

    async function handleToggleActive(userId: string) {
        try {
            const res = await apiFetch(`/admin/users/${userId}/toggle-active`, { method: 'PATCH' });
            if (!res.ok) throw new Error('Failed to toggle user status');
            await loadData();
        } catch (err) {
            console.error('Toggle active failed:', err);
            setFeedback({ type: 'error', message: 'Failed to update user status' });
        }
    }

    async function handleDeleteUser(userId: string, email: string) {
        if (!confirm(`Are you sure you want to delete ${email}? This action cannot be undone.`)) return;

        try {
            const res = await apiDelete(`/admin/users/${userId}`);
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || 'Failed to delete user');
            }
            setFeedback({ type: 'success', message: `User ${email} deleted` });
            await loadData();
        } catch (err: any) {
            setFeedback({ type: 'error', message: err.message || 'Failed to delete user' });
        }
    }

    async function handleToggleRegister(enabled: boolean) {
        setTogglingRegister(true);
        try {
            const res = await apiFetch('/admin/app-settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ register_enabled: enabled }),
            });
            if (!res.ok) throw new Error('Failed to update setting');
            const data = await res.json();
            setRegisterEnabled(data.register_enabled);
            setFeedback({
                type: 'success',
                message: data.register_enabled
                    ? 'Public registration is now ENABLED'
                    : 'Public registration is now DISABLED',
            });
        } catch (err: any) {
            setFeedback({ type: 'error', message: err.message || 'Failed to update setting' });
        } finally {
            setTogglingRegister(false);
        }
    }

    return (
        <div
            className="flex flex-col items-center justify-start p-6 md:p-12 min-h-screen overflow-y-auto"
            style={{
                backgroundImage:
                    'linear-gradient(rgba(29, 78, 216, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.05) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
            }}
        >
            <div className="w-full max-w-4xl border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
                {/* Header */}
                <div className="border-b border-black p-8 bg-white flex justify-between items-start">
                    <div>
                        <h1 className="font-serif text-3xl font-bold tracking-tight uppercase">
                            Admin Panel
                        </h1>
                        <p className="font-mono text-xs text-gray-500 mt-2 uppercase tracking-wider">
                            {'// '}User & Role Management
                        </p>
                    </div>
                    <Link href="/dashboard">
                        <Button variant="outline" size="sm">
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </Button>
                    </Link>
                </div>

                <div className="p-8 space-y-10">
                    {/* Error Banner */}
                    {error && (
                        <div className="border-2 border-red-500 bg-red-50 p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
                            <div className="flex items-start gap-3">
                                <div className="w-3 h-3 bg-red-500 mt-1 shrink-0"></div>
                                <div>
                                    <p className="font-mono text-sm font-bold uppercase tracking-wider text-red-800">
                                        Access Denied
                                    </p>
                                    <p className="font-mono text-xs text-red-700 mt-1">{error}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Feedback */}
                    {feedback && (
                        <div
                            className={`p-3 border-2 font-mono text-sm flex items-center gap-2 ${feedback.type === 'success'
                                    ? 'border-green-500 bg-green-50 text-green-700'
                                    : 'border-red-500 bg-red-50 text-red-700'
                                }`}
                        >
                            {feedback.type === 'success' ? (
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                            ) : (
                                <XCircle className="w-4 h-4 shrink-0" />
                            )}
                            {feedback.message}
                        </div>
                    )}

                    {/* Stats Cards */}
                    {status !== 'error' && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
                                <div className="flex items-center gap-2 mb-2">
                                    <Users className="w-4 h-4 text-gray-500" />
                                    <span className="font-mono text-xs uppercase text-gray-500">Total Users</span>
                                </div>
                                <span className="font-mono text-2xl font-bold">
                                    {status === 'loading' ? '—' : users.length}
                                </span>
                            </div>
                            <div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
                                <div className="flex items-center gap-2 mb-2">
                                    <Shield className="w-4 h-4 text-gray-500" />
                                    <span className="font-mono text-xs uppercase text-gray-500">Roles</span>
                                </div>
                                <span className="font-mono text-2xl font-bold">
                                    {status === 'loading' ? '—' : roles.length}
                                </span>
                            </div>
                            <div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
                                <div className="flex items-center gap-2 mb-2">
                                    <CheckCircle2 className="w-4 h-4 text-gray-500" />
                                    <span className="font-mono text-xs uppercase text-gray-500">Active Users</span>
                                </div>
                                <span className="font-mono text-2xl font-bold">
                                    {status === 'loading' ? '—' : users.filter((u) => u.is_active).length}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* App Settings */}
                    {status !== 'error' && (
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 border-b border-black/10 pb-2">
                                <ToggleLeft className="w-4 h-4" />
                                <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                                    App Settings
                                </h2>
                            </div>
                            <ToggleSwitch
                                checked={registerEnabled}
                                onCheckedChange={handleToggleRegister}
                                disabled={togglingRegister}
                                label="Public Registration"
                                description="Allow anyone to create an account from the login page. New accounts are assigned the 'user' role."
                            />
                        </section>
                    )}

                    {/* User Management */}
                    {status !== 'error' && (
                        <section className="space-y-4">
                            <div className="flex items-center justify-between border-b border-black/10 pb-2">
                                <div className="flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                                        User Management
                                    </h2>
                                </div>
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => {
                                        setShowAddUser(!showAddUser);
                                        setFeedback(null);
                                    }}
                                >
                                    {showAddUser ? (
                                        <XCircle className="w-4 h-4" />
                                    ) : (
                                        <UserPlus className="w-4 h-4" />
                                    )}
                                    {showAddUser ? 'Cancel' : 'Add User'}
                                </Button>
                            </div>

                            {/* Add User Form */}
                            {showAddUser && (
                                <div className="border border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
                                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Plus className="w-3 h-3" />
                                        Create New User
                                    </h3>
                                    <form onSubmit={handleAddUser} className="grid gap-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="newEmail" className="font-mono text-xs uppercase tracking-widest text-gray-500">
                                                    Email
                                                </Label>
                                                <Input
                                                    id="newEmail"
                                                    type="email"
                                                    value={newEmail}
                                                    onChange={(e) => setNewEmail(e.target.value)}
                                                    placeholder="user@example.com"
                                                    required
                                                    className="font-mono"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="newUsername" className="font-mono text-xs uppercase tracking-widest text-gray-500">
                                                    Username
                                                </Label>
                                                <Input
                                                    id="newUsername"
                                                    value={newUsername}
                                                    onChange={(e) => setNewUsername(e.target.value)}
                                                    placeholder="john_doe"
                                                    required
                                                    className="font-mono"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="newPassword" className="font-mono text-xs uppercase tracking-widest text-gray-500">
                                                    Password
                                                </Label>
                                                <Input
                                                    id="newPassword"
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    placeholder="••••••••"
                                                    required
                                                    className="font-mono"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="newRole" className="font-mono text-xs uppercase tracking-widest text-gray-500">
                                                    Role
                                                </Label>
                                                <select
                                                    id="newRole"
                                                    value={newRoleId}
                                                    onChange={(e) => setNewRoleId(e.target.value)}
                                                    className="w-full h-10 px-3 border border-black bg-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                                                >
                                                    {roles.map((role) => (
                                                        <option key={role.id} value={role.id}>
                                                            {role.name.toUpperCase()}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="flex justify-end">
                                            <Button type="submit" disabled={addingUser}>
                                                {addingUser ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <UserPlus className="w-4 h-4" />
                                                )}
                                                {addingUser ? 'Creating...' : 'Create User'}
                                            </Button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            {/* Users Table */}
                            {status === 'loading' ? (
                                <div className="flex items-center justify-center p-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                                </div>
                            ) : (
                                <div className="border border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-black bg-[#E5E5E0]">
                                                <th className="text-left font-mono text-xs uppercase tracking-wider p-3">
                                                    Email
                                                </th>
                                                <th className="text-left font-mono text-xs uppercase tracking-wider p-3">
                                                    Username
                                                </th>
                                                <th className="text-left font-mono text-xs uppercase tracking-wider p-3">
                                                    Role
                                                </th>
                                                <th className="text-left font-mono text-xs uppercase tracking-wider p-3">
                                                    Status
                                                </th>
                                                <th className="text-right font-mono text-xs uppercase tracking-wider p-3">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.length === 0 ? (
                                                <tr>
                                                    <td
                                                        colSpan={5}
                                                        className="text-center font-mono text-sm text-gray-500 p-8"
                                                    >
                                                        No users found
                                                    </td>
                                                </tr>
                                            ) : (
                                                users.map((user) => (
                                                    <tr
                                                        key={user.id}
                                                        className="border-b border-black/10 hover:bg-[#F5F5ED] transition-colors"
                                                    >
                                                        <td className="p-3 font-mono text-sm">{user.email}</td>
                                                        <td className="p-3 font-mono text-sm text-gray-600">{user.username}</td>
                                                        <td className="p-3">
                                                            <span className="inline-block px-2 py-0.5 border border-black bg-blue-50 text-blue-800 font-mono text-xs uppercase">
                                                                {user.role_name}
                                                            </span>
                                                        </td>
                                                        <td className="p-3">
                                                            <span
                                                                className={`inline-flex items-center gap-1 px-2 py-0.5 border font-mono text-xs uppercase ${user.is_active
                                                                        ? 'border-green-500 bg-green-50 text-green-700'
                                                                        : 'border-red-500 bg-red-50 text-red-700'
                                                                    }`}
                                                            >
                                                                {user.is_active ? (
                                                                    <CheckCircle2 className="w-3 h-3" />
                                                                ) : (
                                                                    <XCircle className="w-3 h-3" />
                                                                )}
                                                                {user.is_active ? 'Active' : 'Disabled'}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => handleToggleActive(user.id)}
                                                                    title={user.is_active ? 'Disable user' : 'Enable user'}
                                                                >
                                                                    {user.is_active ? (
                                                                        <ToggleRight className="w-4 h-4 text-green-600" />
                                                                    ) : (
                                                                        <ToggleLeft className="w-4 h-4 text-gray-400" />
                                                                    )}
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => handleDeleteUser(user.id, user.email)}
                                                                    title="Delete user"
                                                                    className="hover:bg-red-100 text-red-600"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    )}

                    {/* Roles Section */}
                    {status !== 'error' && (
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 border-b border-black/10 pb-2">
                                <Shield className="w-4 h-4" />
                                <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                                    Roles
                                </h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {roles.map((role) => (
                                    <div
                                        key={role.id}
                                        className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]"
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <Shield className="w-4 h-4 text-blue-700" />
                                            <span className="font-mono text-sm font-bold uppercase">{role.name}</span>
                                        </div>
                                        <p className="font-mono text-xs text-gray-500">
                                            {(() => {
                                                try {
                                                    const perms = JSON.parse(role.permissions);
                                                    if (perms.includes('*')) return 'Full access';
                                                    return `${perms.length} permission(s)`;
                                                } catch {
                                                    return 'Unknown permissions';
                                                }
                                            })()}
                                        </p>
                                        <p className="font-mono text-xs text-gray-400 mt-1">
                                            {users.filter((u) => u.role_name === role.name).length} user(s)
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Footer */}
                    <div className="border-t border-black/10 pt-4">
                        <p className="font-mono text-xs text-gray-400 text-center uppercase tracking-wider">
                            Admin Panel — Resume Matcher
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
