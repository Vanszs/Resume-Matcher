import { API_BASE } from '@/lib/api/client';
import { translate } from '@/lib/i18n/server';
import { resolveLocale } from '@/lib/i18n/locale';
import { withLocalizedDefaultSections } from '@/lib/utils/section-helpers';
import { ResumePrintDocument } from '@/lib/print/resume-print';
import type { ResumeData } from '@/components/dashboard/resume-component';
import type { TemplateSettings } from '@/lib/types/template-settings';

type PageProps = {
  params: Promise<{ previewId: string }>;
  searchParams?: Promise<{
    accessKey?: string;
  }>;
};

interface PreviewDocumentPayload {
  data: {
    resumeData: ResumeData;
    settings: TemplateSettings;
    lang?: string | null;
  };
}

async function fetchPreviewDocument(
  previewId: string,
  accessKey: string
): Promise<PreviewDocumentPayload['data']> {
  const url = `${API_BASE}/resume-preview/${encodeURIComponent(previewId)}?accessKey=${encodeURIComponent(accessKey)}`;
  const res = await fetch(url, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to load resume preview (status ${res.status}).`);
  }
  const payload = (await res.json()) as PreviewDocumentPayload;
  return payload.data;
}

export default async function PrintResumePreviewPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const accessKey = resolvedSearchParams?.accessKey?.trim();

  if (!accessKey) {
    throw new Error('Missing resume preview access key.');
  }

  const preview = await fetchPreviewDocument(resolvedParams.previewId, accessKey);
  const locale = resolveLocale(preview.lang ?? undefined);
  const t = (key: string, values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const localizedResumeData = withLocalizedDefaultSections(preview.resumeData, t);

  return (
    <ResumePrintDocument
      resumeData={localizedResumeData}
      settings={preview.settings}
      additionalSectionLabels={{
        technicalSkills: t('resume.additionalLabels.technicalSkills'),
        languages: t('resume.additionalLabels.languages'),
        certifications: t('resume.additionalLabels.certifications'),
        awards: t('resume.additionalLabels.awards'),
      }}
      sectionHeadings={{
        summary: t('resume.sections.summary'),
        experience: t('resume.sections.experience'),
        education: t('resume.sections.education'),
        projects: t('resume.sections.projects'),
        certifications: t('resume.sections.certifications'),
        skills: t('resume.sections.skillsOnly'),
        languages: t('resume.sections.languages'),
        awards: t('resume.sections.awards'),
        links: t('resume.sections.links'),
      }}
      fallbackLabels={{
        name: t('resume.defaults.name'),
      }}
    />
  );
}
