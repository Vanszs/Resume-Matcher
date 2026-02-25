'use client';

import React, { useState, useMemo } from 'react';
import { Internship } from '@/app/internships/page';
import { ExternalLink, Search, ShieldAlert, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

type Props = {
    active: Internship[];
    offSeason: Internship[];
    inactive: Internship[];
    fetchedAt: string;
};

const PAGE_SIZE = 50;

function getUniqueSections(items: Internship[]): string[] {
    const seen = new Set<string>();
    items.forEach((i) => {
        if (i.section && i.section !== 'General') seen.add(i.section);
    });
    return Array.from(seen).sort();
}

function getSectionCounts(items: Internship[]): Record<string, number> {
    const counts: Record<string, number> = {};
    items.forEach((i) => {
        if (i.section) counts[i.section] = (counts[i.section] ?? 0) + 1;
    });
    return counts;
}

type FilterSource = 'active' | 'off-season' | 'inactive' | 'all';

const SOURCE_POOL: Record<FilterSource, Internship['source'][]> = {
    active:      ['active'],
    'off-season': ['off-season'],
    inactive:    ['inactive'],
    all:         ['active', 'off-season', 'inactive'],
};

export default function InternshipListClient({ active, offSeason, inactive, fetchedAt }: Props) {
    const [search, setSearch] = useState('');
    const [filterSource, setFilterSource] = useState<FilterSource>('active');
    const [filterSection, setFilterSection] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);

    const allInternships = useMemo(
        () => [...active, ...offSeason, ...inactive],
        [active, offSeason, inactive]
    );

    // Pool visible based on source tab
    const poolBySource = useMemo(() => {
        const allowed = SOURCE_POOL[filterSource];
        return allInternships.filter((i) => allowed.includes(i.source));
    }, [allInternships, filterSource]);

    const sections = useMemo(() => getUniqueSections(poolBySource), [poolBySource]);
    const sectionCounts = useMemo(() => getSectionCounts(poolBySource), [poolBySource]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return poolBySource.filter((item) => {
            if (q && !item.company.toLowerCase().includes(q) && !item.role.toLowerCase().includes(q) && !item.location.toLowerCase().includes(q))
                return false;
            if (filterSection !== 'all' && item.section !== filterSection) return false;
            return true;
        });
    }, [poolBySource, search, filterSection]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);
    const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    function handleSearch(val: string) { setSearch(val); setCurrentPage(1); }
    function handleFilterSource(val: FilterSource) { setFilterSource(val); setFilterSection('all'); setCurrentPage(1); }
    function handleFilterSection(val: string) { setFilterSection(val); setCurrentPage(1); }

    const sourceFilters: { id: FilterSource; label: string; count: number; color: string }[] = [
        { id: 'active',      label: 'Active',      count: active.length,     color: 'bg-[#15803D] text-white border-[#15803D]' },
        { id: 'off-season',  label: 'Off-Season',  count: offSeason.length,  color: 'bg-[#1D4ED8] text-white border-[#1D4ED8]' },
        { id: 'inactive',    label: 'Inactive',    count: inactive.length,   color: 'bg-gray-500 text-white border-gray-500' },
        { id: 'all',         label: 'All',         count: allInternships.length, color: 'bg-black text-white border-black' },
    ];

    return (
        <div
            className="flex flex-col items-center justify-start p-4 md:p-10 min-h-screen overflow-y-auto"
            style={{
                backgroundImage:
                    'linear-gradient(rgba(29, 78, 216, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.05) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
            }}
        >
            <div className="w-full max-w-6xl border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
                {/* Header */}
                <div className="border-b border-black p-6 sm:p-8 bg-white flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <p className="font-mono text-xs text-gray-400 uppercase tracking-widest mb-2">Pitt CSC &amp; Simplify</p>
                        <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight uppercase leading-tight">
                            Summer 2026<br />
                            <span className="bg-[#F97316] text-white px-2 inline-block border border-black shadow-[3px_3px_0px_0px_#000000]">
                                Internship List
                            </span>
                        </h1>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-3 font-mono text-xs text-gray-500 uppercase">
                            <span className="inline-flex items-center gap-1">
                                <span className="w-2 h-2 bg-[#15803D] inline-block border border-black"></span>
                                {active.length} Active
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <span className="w-2 h-2 bg-[#1D4ED8] inline-block border border-black"></span>
                                {offSeason.length} Off-Season
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <span className="w-2 h-2 bg-gray-400 inline-block border border-black"></span>
                                {inactive.length} Inactive
                            </span>
                        </div>
                        <p className="font-mono text-[10px] text-gray-400 uppercase">
                            Updated: {new Date(fetchedAt).toLocaleString()}
                        </p>
                    </div>
                </div>

                <div className="p-5 sm:p-8 space-y-4">
                    {/* Search + Filters */}
                    <div className="bg-white border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] p-4 space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search companies, roles, locations..."
                                value={search}
                                onChange={(e) => handleSearch(e.target.value)}
                                className="w-full h-10 pl-10 pr-4 border border-black bg-[#F5F5ED] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            {/* Source tabs with counts */}
                            <div className="flex border border-black overflow-hidden">
                                {sourceFilters.map((f) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => handleFilterSource(f.id)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs uppercase border-r last:border-r-0 border-black transition-colors ${
                                            filterSource === f.id
                                                ? f.color
                                                : 'bg-white hover:bg-[#F0F0E8] text-black'
                                        }`}
                                    >
                                        {f.label}
                                        <span className={`font-mono text-[10px] px-1 border ${
                                            filterSource === f.id ? 'border-white/40 bg-white/20' : 'border-black/20 bg-black/5'
                                        }`}>
                                            {f.count}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {/* Category pill buttons — populated from real section names */}
                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => handleFilterSection('all')}
                                    className={`px-3 py-1 border border-black font-mono text-xs uppercase transition-colors ${
                                        filterSection === 'all' ? 'bg-black text-white' : 'bg-white hover:bg-[#F0F0E8]'
                                    }`}
                                >
                                    All ({poolBySource.length})
                                </button>
                                {sections.map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => handleFilterSection(s)}
                                        className={`px-3 py-1 border border-black font-mono text-xs uppercase transition-colors ${
                                            filterSection === s ? 'bg-black text-white' : 'bg-white hover:bg-[#F0F0E8]'
                                        }`}
                                    >
                                        {s} ({sectionCounts[s] ?? 0})
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Results bar */}
                    <div className="flex items-center justify-between border-b-2 border-black pb-2">
                        <span className="font-mono text-sm font-bold uppercase tracking-wider">
                            {filtered.length} Roles Found
                        </span>
                        {totalPages > 1 && (
                            <span className="font-mono text-xs text-gray-500 uppercase">
                                Page {safePage} / {totalPages}
                            </span>
                        )}
                    </div>

                    {/* Table */}
                    <div className="bg-white border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b-2 border-black bg-[#E5E5E0]">
                                    <th className="p-3 font-mono text-xs uppercase tracking-wider">Company</th>
                                    <th className="p-3 font-mono text-xs uppercase tracking-wider">Role / Category</th>
                                    <th className="p-3 font-mono text-xs uppercase tracking-wider hidden md:table-cell">Location</th>
                                    <th className="p-3 font-mono text-xs uppercase tracking-wider hidden lg:table-cell">Posted</th>
                                    <th className="p-3 font-mono text-xs uppercase tracking-wider text-right">Apply</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paged.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center font-mono text-gray-400 uppercase text-xs">
                                            No internships found.
                                        </td>
                                    </tr>
                                ) : (
                                    paged.map((item, idx) => (
                                        <tr
                                            key={`${item.company}-${item.role}-${idx}`}
                                            className={`border-b transition-colors ${
                                                item.source === 'inactive'
                                                    ? 'border-black/5 bg-gray-100 opacity-45 hover:opacity-80'
                                                    : item.isClosed
                                                        ? 'border-black/5 opacity-50 hover:opacity-75'
                                                        : item.isSubRole
                                                            ? 'border-black/10 bg-gray-50/60'
                                                            : 'border-black/10 hover:bg-[#F5F5ED]'
                                            }`}
                                        >
                                            {/* Company */}
                                            <td className="p-3">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {item.isSubRole && <span className="text-gray-400 font-mono text-xs">↳</span>}
                                                    {item.companyUrl ? (
                                                        <a
                                                            href={item.companyUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="font-bold text-sm hover:text-[#1D4ED8] hover:underline"
                                                        >
                                                            {item.company}
                                                        </a>
                                                    ) : (
                                                        <span className="font-bold text-sm">{item.company}</span>
                                                    )}
                                                    {item.isClosed && (
                                                        <span className="inline-flex items-center gap-0.5 bg-red-50 text-red-700 text-[9px] px-1 py-0.5 font-mono uppercase font-bold border border-red-300">
                                                            <ShieldAlert className="w-2.5 h-2.5" /> Closed
                                                        </span>
                                                    )}
                                                    {item.source === 'inactive' && (
                                                        <span className="inline-flex items-center bg-gray-100 text-gray-500 text-[9px] px-1 py-0.5 font-mono uppercase font-bold border border-gray-300">
                                                            Inactive
                                                        </span>
                                                    )}
                                                    {item.source === 'off-season' && (
                                                        <span className="inline-flex items-center bg-blue-50 text-blue-700 text-[9px] px-1 py-0.5 font-mono uppercase font-bold border border-blue-300">
                                                            Off-Season
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Role + section tag */}
                                            <td className="p-3">
                                                <span className="font-medium text-sm">{item.role}</span>
                                                {item.section && item.section !== 'General' && (
                                                    <div className="font-mono text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider">
                                                        {item.section}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Location */}
                                            <td className="p-3 text-sm text-gray-600 hidden md:table-cell max-w-[180px]">
                                                <span className="line-clamp-2">{item.location || '—'}</span>
                                            </td>

                                            {/* Age/date posted */}
                                            <td className="p-3 hidden lg:table-cell">
                                                {item.age ? (
                                                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-gray-400 uppercase">
                                                        <CalendarDays className="w-3 h-3" />
                                                        {item.age}
                                                    </span>
                                                ) : (
                                                    <span className="font-mono text-[10px] text-gray-300">—</span>
                                                )}
                                            </td>

                                            {/* Apply + Simplify links */}
                                            <td className="p-3 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {item.simplifyUrl && (
                                                        <a
                                                            href={item.simplifyUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center h-7 px-2 border border-[#1D4ED8] bg-blue-50 text-[#1D4ED8] font-mono text-[10px] uppercase hover:bg-[#1D4ED8] hover:text-white transition-colors"
                                                        >
                                                            Simplify
                                                        </a>
                                                    )}
                                                    {item.applyUrl ? (
                                                        <a
                                                            href={item.applyUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 h-7 px-2.5 border border-black bg-black text-white font-mono text-[10px] uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] hover:bg-[#1D4ED8] hover:border-[#1D4ED8] transition-colors"
                                                        >
                                                            Apply <ExternalLink className="w-2.5 h-2.5" />
                                                        </a>
                                                    ) : (
                                                        <span className="text-gray-300 font-mono text-[10px] uppercase">No Link</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between border border-black bg-white px-4 py-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
                            <span className="font-mono text-xs text-gray-500 uppercase tracking-wider">
                                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={safePage === 1}
                                    className="flex items-center gap-1 px-3 py-1 border border-black font-mono text-xs uppercase bg-white hover:bg-[#F0F0E8] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="w-3 h-3" /> Prev
                                </button>
                                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                    const start = Math.max(1, Math.min(safePage - 3, totalPages - 6));
                                    const page = totalPages > 7 ? start + i : i + 1;
                                    return (
                                        <button
                                            key={page}
                                            type="button"
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-8 h-7 border font-mono text-xs transition-colors ${page === safePage ? 'border-black bg-black text-white' : 'border-black bg-white hover:bg-[#F0F0E8]'}`}
                                        >
                                            {page}
                                        </button>
                                    );
                                })}
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={safePage === totalPages}
                                    className="flex items-center gap-1 px-3 py-1 border border-black font-mono text-xs uppercase bg-white hover:bg-[#F0F0E8] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    Next <ChevronRight className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    )}

                    <p className="font-mono text-[10px] text-gray-400 text-center uppercase tracking-wider">
                        Data source: github.com/SimplifyJobs/Summer2026-Internships · Refreshed every 24h
                    </p>
                </div>
            </div>
        </div>
    );
}
