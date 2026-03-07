'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

interface TailorProgressProps {
  progress: number;
  stage: string;
  onCancel: () => void;
}

export function TailorProgress({ progress, stage, onCancel }: TailorProgressProps) {
  const { t } = useTranslations();

  const STAGE_LABELS: Record<string, string> = {
    queued: t('tailor.progress.queued'),
    extract_keywords: t('tailor.progress.extractKeywords'),
    improve_resume: t('tailor.progress.improveResume'),
    refine_resume: t('tailor.progress.refineResume'),
    finalize: t('tailor.progress.finalize'),
    done: t('tailor.progress.done'),
  };

  const label = STAGE_LABELS[stage] ?? t('tailor.progress.processing');
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className="w-full border border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-black">
            {label}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="h-6 w-6 p-0 text-gray-500 hover:text-black"
          aria-label={t('tailor.progress.cancel')}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-100 border border-black overflow-hidden">
        <div
          className="h-full bg-blue-700 transition-all duration-500 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>

      <p className="font-mono text-xs text-gray-500 mt-2 text-right">
        {clampedProgress}%
      </p>
    </div>
  );
}
