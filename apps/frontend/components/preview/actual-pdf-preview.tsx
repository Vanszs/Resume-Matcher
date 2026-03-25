'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, FileWarning, FileText } from 'lucide-react';
import type { ResumeData } from '@/components/dashboard/resume-component';
import { PaginatedPreview } from '@/components/preview/paginated-preview';
import type { TemplateSettings } from '@/lib/types/template-settings';
import type { Locale } from '@/i18n/config';
import { renderDraftResumePdf } from '@/lib/api/resume';
import { useTranslations } from '@/lib/i18n';

interface ActualPdfPreviewProps {
  resumeData: ResumeData;
  settings: TemplateSettings;
  locale: Locale;
}

const RENDER_DEBOUNCE_MS = 1500;

export function ActualPdfPreview({ resumeData, settings, locale }: ActualPdfPreviewProps) {
  const { t } = useTranslations();
  const deferredResumeData = useDeferredValue(resumeData);
  const deferredSettings = useDeferredValue(settings);
  const payloadSignature = useMemo(
    () =>
      JSON.stringify({
        resumeData: deferredResumeData,
        settings: deferredSettings,
        locale,
      }),
    [deferredResumeData, deferredSettings, locale]
  );

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'syncing' | 'ready' | 'error'>('syncing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const queuedRenderRef = useRef(false);
  const latestPayloadRef = useRef({
    resumeData: deferredResumeData,
    settings: deferredSettings,
    locale,
    signature: payloadSignature,
  });

  latestPayloadRef.current = {
    resumeData: deferredResumeData,
    settings: deferredSettings,
    locale,
    signature: payloadSignature,
  };

  useEffect(() => {
    const renderLatestPreview = async () => {
      if (inFlightRef.current || !queuedRenderRef.current) {
        return;
      }

      queuedRenderRef.current = false;
      inFlightRef.current = true;
      const snapshot = latestPayloadRef.current;

      try {
        const blob = await renderDraftResumePdf(
          snapshot.resumeData,
          snapshot.settings,
          snapshot.locale
        );
        const nextUrl = URL.createObjectURL(blob);
        const isLatestSnapshot =
          snapshot.signature === latestPayloadRef.current.signature && !queuedRenderRef.current;

        if (!isLatestSnapshot) {
          URL.revokeObjectURL(nextUrl);
          return;
        }

        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }

        objectUrlRef.current = nextUrl;
        setPdfUrl(nextUrl);
        setErrorMessage(null);
        setStatus('ready');
      } catch (error) {
        const isLatestSnapshot =
          snapshot.signature === latestPayloadRef.current.signature && !queuedRenderRef.current;
        if (isLatestSnapshot) {
          setStatus('error');
          setErrorMessage(error instanceof Error ? error.message : t('common.unknown'));
        }
      } finally {
        inFlightRef.current = false;
        if (queuedRenderRef.current) {
          timeoutRef.current = window.setTimeout(() => {
            void renderLatestPreview();
          }, RENDER_DEBOUNCE_MS);
        }
      }
    };

    queuedRenderRef.current = true;
    setStatus('syncing');

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      void renderLatestPreview();
    }, RENDER_DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [deferredResumeData, deferredSettings, locale, payloadSignature, t]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const showExactPreview = status === 'ready' && pdfUrl !== null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-300 bg-[#E5E5E0] px-4 py-2 shrink-0">
        <div className="flex items-center gap-2 text-gray-700">
          {status === 'syncing' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status === 'error' ? (
            <FileWarning className="w-4 h-4 text-red-600" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          <span className="font-mono text-xs uppercase tracking-wider">
            {showExactPreview ? 'Actual Print Preview' : 'Live Preview'}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500">
          {showExactPreview ? 'PDF Synced' : 'PDF Sync Pending'}
        </span>
      </div>

      <div
        className="relative flex-1 overflow-auto bg-[#D5D5D0] p-4"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        {showExactPreview ? (
          <div className="mx-auto h-full max-w-[980px] border-2 border-black bg-white shadow-[6px_6px_0px_0px_#000000]">
            <iframe
              key={pdfUrl}
              src={`${pdfUrl}#view=FitH&pagemode=none`}
              title="Actual print preview"
              className="h-full w-full border-0"
            />
          </div>
        ) : (
          <PaginatedPreview resumeData={resumeData} settings={settings} />
        )}

        {status === 'syncing' && (
          <div className="pointer-events-none absolute inset-4 flex items-start justify-end">
            <div className="border border-black bg-[#F0F0E8] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-blue-700 shadow-[3px_3px_0px_0px_#000000]">
              Syncing download layout...
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
            <div className="max-w-2xl border-2 border-black bg-white px-4 py-3 shadow-[6px_6px_0px_0px_#000000]">
              <p className="font-mono text-xs uppercase tracking-wider text-red-600">
                Exact PDF preview unavailable. Showing live preview.
              </p>
              <p className="mt-2 text-sm text-gray-700">{errorMessage}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
