'use client';

import Link from 'next/link';
import { ArrowLeft, Home, FileSearch } from 'lucide-react';

export default function NotFound() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-[#F0F0E8] p-6"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.08) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="w-full max-w-2xl">
        {/* Main card */}
        <div className="border border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          {/* Top accent bar */}
          <div className="h-1 bg-[#1D4ED8]" />

          {/* Header */}
          <div className="border-b border-black p-8 md:p-12 flex items-end gap-8">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#1D4ED8] mb-2">
                {'// ERROR_CODE_404'}
              </p>
              <h1 className="font-serif text-[8rem] md:text-[10rem] font-bold leading-none text-black tracking-tighter select-none">
                404
              </h1>
            </div>
            <div className="pb-4 border-l border-black pl-8 hidden sm:block">
              <p className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-1">
                STATUS
              </p>
              <p className="font-serif text-2xl font-bold uppercase text-black">
                Page Not Found
              </p>
              <p className="font-mono text-xs text-gray-500 mt-3 leading-relaxed max-w-xs">
                The resource you requested does not exist or has been moved to a different location.
              </p>
            </div>
          </div>

          {/* Mobile description */}
          <div className="px-8 pt-6 sm:hidden border-b border-black pb-6">
            <p className="font-serif text-xl font-bold uppercase text-black mb-2">
              Page Not Found
            </p>
            <p className="font-mono text-xs text-gray-500 leading-relaxed">
              The resource you requested does not exist or has been moved to a different location.
            </p>
          </div>

          {/* Metadata row */}
          <div className="grid grid-cols-3 border-b border-black divide-x divide-black">
            <div className="p-4 md:p-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 mb-1">
                Type
              </p>
              <p className="font-mono text-xs font-bold text-black">CLIENT_ERROR</p>
            </div>
            <div className="p-4 md:p-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 mb-1">
                Code
              </p>
              <p className="font-mono text-xs font-bold text-black">HTTP_404</p>
            </div>
            <div className="p-4 md:p-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 mb-1">
                Action
              </p>
              <p className="font-mono text-xs font-bold text-[#15803D]">NAVIGATE_BACK</p>
            </div>
          </div>

          {/* Actions */}
          <div className="p-8 md:p-10 flex flex-col sm:flex-row gap-3">
            <Link
              href="/dashboard"
              className="flex-1 flex items-center justify-center gap-2 bg-[#1D4ED8] hover:bg-[#1e40af] text-white border border-black shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all font-mono text-xs font-bold uppercase tracking-wider px-6 py-3"
            >
              <Home className="w-4 h-4" />
              Go to Dashboard
            </Link>
            <button
              onClick={() => history.back()}
              className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-black border border-black shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all font-mono text-xs font-bold uppercase tracking-wider px-6 py-3"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </button>
            <Link
              href="/resumes"
              className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-black border border-black shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all font-mono text-xs font-bold uppercase tracking-wider px-6 py-3"
            >
              <FileSearch className="w-4 h-4" />
              My Resumes
            </Link>
          </div>
        </div>

        {/* Footer label */}
        <div className="mt-4 flex items-center justify-between px-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400">
            Resume Matcher
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400">
            {new Date().getFullYear()} — All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
}
