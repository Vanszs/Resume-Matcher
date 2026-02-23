'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ResumePreviewProvider } from '@/components/common/resume_previewer_context';
import { StatusCacheProvider } from '@/lib/context/status-cache';
import { LanguageProvider } from '@/lib/context/language-context';
import { LocalizedErrorBoundary } from '@/components/common/error-boundary';

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Safety net: after every client-side navigation, ensure any stale
  // body scroll-lock left behind by a Dialog unmounting mid-transition
  // is cleared, so the page never gets permanently locked.
  useEffect(() => {
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
  }, [pathname]);

  return (
    <StatusCacheProvider>
      <LanguageProvider>
        <ResumePreviewProvider>
          <LocalizedErrorBoundary>
            <main className="min-h-screen flex flex-col">{children}</main>
          </LocalizedErrorBoundary>
        </ResumePreviewProvider>
      </LanguageProvider>
    </StatusCacheProvider>
  );
}
