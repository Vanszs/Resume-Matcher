'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import { useTranslations } from '@/lib/i18n';
import { logout } from '@/lib/api/client';

export const SwissGrid = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslations();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    setIsAdmin(localStorage.getItem('user_role') === 'admin');
    setUserEmail(localStorage.getItem('user_email') || '');
  }, []);

  return (
    // 1. Outer Wrapper: Fixed height with grid background
    <div
      className="h-screen w-full flex justify-center items-start py-12 px-4 md:px-8 overflow-hidden bg-[#F0F0E8]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      {/* 2. The Main Container: Sharp black borders, creating the "Canvas" */}
      <div className="w-full max-w-[86rem] max-h-full border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden">
        {/* Header Section - stays above hovered cards */}
        <div className="border-b border-black p-8 md:p-12 shrink-0 bg-[#F0F0E8] relative z-30">
          <h1 className="font-serif text-5xl md:text-7xl text-black tracking-tight leading-[0.95] uppercase">
            {t('nav.dashboard')}
          </h1>
          <p className="mt-6 text-sm font-mono text-blue-700 uppercase tracking-wide max-w-md font-bold">
            {'// '}
            {t('dashboard.selectModule')}
          </p>
        </div>

        {/* Content Grid - Scrollable area with NO padding */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden relative z-10">
          <div className="p-[1.5px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 bg-black gap-[1px] border-b border-black">
              {children}
            </div>
          </div>
        </div>

        {/* Footer - stays above hovered cards */}
        <div className="p-4 bg-[#F0F0E8] flex justify-between items-center font-mono text-xs text-blue-700 border-t border-black shrink-0 relative z-30">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Resume Matcher"
              width={20}
              height={20}
              className="w-5 h-5"
            />
            <span className="uppercase font-bold">Resume Matcher</span>
            {userEmail && (
              <span className="hidden sm:inline text-gray-500 font-normal normal-case">— {userEmail}</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <Link
                href="/admin"
                className="bg-[#1D4ED8] text-white border border-black px-6 py-2 uppercase font-bold tracking-wide shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all min-w-[140px] text-center"
              >
                {t('nav.admin')}
              </Link>
            )}
            <Link
              href="/settings"
              className="bg-[#F97316] text-black border border-black px-6 py-2 uppercase font-bold tracking-wide shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all min-w-[140px] text-center"
            >
              {t('nav.settings')}
            </Link>
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center gap-2 bg-[#DC2626] text-white border border-black px-6 py-2 uppercase font-bold tracking-wide shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
            >
              <LogOut className="w-4 h-4" />
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
