'use client';

import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { X, Users, BarChart3, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ActivityDataPoint = {
    date: string;
    actions: number;
};

type UserDetailData = {
    id: string;
    email: string;
    username: string;
    role_name: string;
    is_active: boolean;
    is_verified: boolean;
    created_at: string;
    last_login: string | null;
    total_resumes: number;
    total_tailored_resumes: number;
    total_master_resumes: number;
    activity_timeline: ActivityDataPoint[];
};

interface UserDetailModalProps {
    user: UserDetailData;
    onClose: () => void;
}

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return '—';
    }
}

function formatDatetime(iso: string | null): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '—';
    }
}

function formatXTick(dateStr: string): string {
    try {
        const [, mm, dd] = dateStr.split('-');
        return `${mm}/${dd}`;
    } catch {
        return dateStr;
    }
}

function formatTooltipDate(dateStr: string): string {
    try {
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return dateStr;
    }
}

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="border border-black bg-white px-3 py-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
            <p className="font-mono text-xs text-gray-500">{formatTooltipDate(label)}</p>
            <p className="font-mono text-sm font-bold">
                {payload[0].value}{' '}
                <span className="font-normal text-gray-500">
                    {payload[0].value === 1 ? 'action' : 'actions'}
                </span>
            </p>
        </div>
    );
}

export function UserDetailModal({ user, onClose }: UserDetailModalProps) {
    const isEmptyActivity = user.activity_timeline.every((p) => p.actions === 0);
    const maxActivity = Math.max(...user.activity_timeline.map((p) => p.actions), 0);
    const yDomain: [number, number | string] = maxActivity === 0 ? [0, 5] : [0, 'auto'];

    // Show every 5th tick on X axis to avoid crowding
    const xTickFormatter = (val: string, idx: number) => (idx % 5 === 0 ? formatXTick(val) : '');

    React.useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-detail-title"
        >
            <div
                className="w-full max-w-2xl border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] flex flex-col"
                style={{ maxHeight: '90vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between border-b border-black p-5 shrink-0">
                    <div>
                        <h2
                            id="user-detail-title"
                            className="font-serif text-xl font-bold uppercase tracking-tight"
                        >
                            User Detail
                        </h2>
                        <p className="font-mono text-xs text-gray-500 uppercase mt-1">
                            {'// '}{user.email}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="border border-black bg-white p-1 shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 p-5 space-y-6">

                    {/* Section A: Basic Info */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-black/10 pb-2">
                            <Users className="w-4 h-4" />
                            <h3 className="font-mono text-sm font-bold uppercase tracking-wider">
                                Basic Info
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            <InfoField label="User ID" value={user.id} mono />
                            <InfoField label="Role" value={user.role_name.toUpperCase()} />
                            <InfoField label="Username" value={user.username} />
                            <InfoField
                                label="Account Status"
                                value={
                                    <span
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 border font-mono text-xs uppercase ${
                                            user.is_active
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
                                }
                            />
                            <InfoField label="Email" value={user.email} />
                            <InfoField
                                label="Email Verified"
                                value={
                                    user.is_verified ? (
                                        <span className="inline-flex items-center gap-1 font-mono text-xs text-green-700">
                                            <CheckCircle2 className="w-3 h-3" /> Verified
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 font-mono text-xs text-gray-500">
                                            <XCircle className="w-3 h-3" /> Not Verified
                                        </span>
                                    )
                                }
                            />
                            <InfoField label="Created At" value={formatDate(user.created_at)} />
                            <InfoField label="Last Login" value={formatDatetime(user.last_login)} />
                        </div>
                    </section>

                    {/* Section B: Activity */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-black/10 pb-2">
                            <BarChart3 className="w-4 h-4" />
                            <h3 className="font-mono text-sm font-bold uppercase tracking-wider">
                                Activity Overview
                            </h3>
                        </div>

                        {/* Stats cards */}
                        <div className="grid grid-cols-3 gap-3">
                            <StatCard label="Total Resumes" value={user.total_resumes} />
                            <StatCard label="Tailored" value={user.total_tailored_resumes} />
                            <StatCard label="Master" value={user.total_master_resumes} />
                        </div>

                        {/* Chart */}
                        <div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
                            <p className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-gray-700">
                                Activity — Last 30 Days
                            </p>
                            <div className="relative">
                                <ResponsiveContainer width="100%" height={240}>
                                    <LineChart
                                        data={user.activity_timeline}
                                        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                                    >
                                        <CartesianGrid
                                            horizontal
                                            vertical={false}
                                            stroke="#E5E5E0"
                                            strokeDasharray="3 3"
                                        />
                                        <XAxis
                                            dataKey="date"
                                            tickFormatter={xTickFormatter}
                                            tick={{ fontFamily: 'monospace', fontSize: 11, fill: '#000' }}
                                            axisLine={{ stroke: '#000', strokeWidth: 1 }}
                                            tickLine={{ stroke: '#000' }}
                                        />
                                        <YAxis
                                            allowDecimals={false}
                                            domain={yDomain}
                                            width={40}
                                            tick={{ fontFamily: 'monospace', fontSize: 11, fill: '#000' }}
                                            axisLine={{ stroke: '#000', strokeWidth: 1 }}
                                            tickLine={{ stroke: '#000' }}
                                        />
                                        <Tooltip
                                            content={<CustomTooltip />}
                                            cursor={{ stroke: '#000', strokeWidth: 1, strokeDasharray: '3 3' }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="actions"
                                            stroke="#1D4ED8"
                                            strokeWidth={2}
                                            dot={{ fill: '#1D4ED8', r: 3 }}
                                            activeDot={{ r: 5, fill: '#1D4ED8', stroke: '#000', strokeWidth: 1 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                                {isEmptyActivity && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <p className="font-mono text-sm text-gray-400 uppercase tracking-wider">
                                            No activity in the last 30 days
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="border-t border-black p-4 flex items-center justify-end shrink-0">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}

function InfoField({
    label,
    value,
    mono,
}: {
    label: string;
    value: React.ReactNode;
    mono?: boolean;
}) {
    return (
        <div className="space-y-1">
            <p className="font-mono text-xs uppercase tracking-widest text-gray-500">{label}</p>
            {typeof value === 'string' ? (
                <p className={`font-mono text-sm font-medium break-all ${mono ? 'text-gray-600 text-xs' : ''}`}>
                    {value || '—'}
                </p>
            ) : (
                <div>{value}</div>
            )}
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: number }) {
    return (
        <div className="border border-black bg-white p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
            <p className="font-mono text-xs uppercase text-gray-500 mb-1">{label}</p>
            <p className="font-mono text-xl font-bold">{value}</p>
        </div>
    );
}
