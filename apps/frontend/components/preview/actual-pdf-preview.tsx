'use client';

import type { ResumeData } from '@/components/dashboard/resume-component';
import { PaginatedPreview } from '@/components/preview/paginated-preview';
import type { TemplateSettings } from '@/lib/types/template-settings';
import type { Locale } from '@/i18n/config';

interface ActualPdfPreviewProps {
  resumeData: ResumeData;
  settings: TemplateSettings;
  locale: Locale;
}

/**
 * Keep the builder on a single preview surface so the user does not see a
 * visual jump between the live HTML preview and a separate PDF iframe state.
 */
export function ActualPdfPreview({ resumeData, settings, locale: _locale }: ActualPdfPreviewProps) {
  return <PaginatedPreview resumeData={resumeData} settings={settings} />;
}
