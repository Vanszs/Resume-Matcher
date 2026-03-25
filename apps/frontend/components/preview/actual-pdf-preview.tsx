'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, FileWarning, FileText } from 'lucide-react';
import type { ResumeData } from '@/components/dashboard/resume-component';
import type { TemplateSettings } from '@/lib/types/template-settings';
import type { Locale } from '@/i18n/config';
import { renderDraftResumePdf } from '@/lib/api/resume';
import { useTranslations } from '@/lib/i18n';

interface ActualPdfPreviewProps {
  resumeData: ResumeData;
  settings: TemplateSettings;
  locale: Locale;
}

const RENDER_DEBOUNCE_MS = 700;

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
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setStatus('loading');
      setErrorMessage(null);

      try {
        const blob = await renderDraftResumePdf(deferredResumeData, deferredSettings, locale);
        const nextUrl = URL.createObjectURL(blob);
        if (requestId !== requestIdRef.current) {
          URL.revokeObjectURL(nextUrl);
          return;
        }

        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }
        objectUrlRef.current = nextUrl;
        setPdfUrl(nextUrl);
        setStatus('ready');
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : t('common.unknown'));
      }
    }, RENDER_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [deferredResumeData, deferredSettings, locale, payloadSignature, t]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-300 bg-[#E5E5E0] px-4 py-2 shrink-0">
        <div className="flex items-center gap-2 text-gray-700">
          {status === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status === 'error' ? (
            <FileWarning className="w-4 h-4 text-red-600" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          <span className="font-mono text-xs uppercase tracking-wider">
            {status === 'loading'
              ? t('preview.calculating')
              : status === 'error'
                ? t('common.error')
                : 'Actual Print Preview'}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500">PDF</span>
      </div>

      <div
        className="relative flex-1 overflow-auto bg-[#D5D5D0] p-4"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        {pdfUrl ? (
          <div className="mx-auto h-full max-w-[980px] border-2 border-black bg-white shadow-[6px_6px_0px_0px_#000000]">
            <iframe
              key={pdfUrl}
              src={`${pdfUrl}#view=FitH&pagemode=none`}
              title="Actual print preview"
              className="h-full w-full border-0"
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center border-2 border-dashed border-gray-400 bg-white/60">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-gray-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Rendering PDF Preview</span>
            </div>
          </div>
        )}

        {status === 'loading' && pdfUrl && (
          <div className="pointer-events-none absolute inset-4 flex items-start justify-end">
            <div className="border border-black bg-[#F0F0E8] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-blue-700 shadow-[3px_3px_0px_0px_#000000]">
              Rendering latest draft...
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-4 flex items-center justify-center">
            <div className="max-w-md border-2 border-black bg-white p-4 shadow-[6px_6px_0px_0px_#000000]">
              <p className="font-mono text-xs uppercase tracking-wider text-red-600">
                Actual print preview failed
              </p>
              <p className="mt-2 text-sm text-gray-700">{errorMessage}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
