import { API_BASE } from '@/lib/api/client';
import { translate } from '@/lib/i18n/server';
import { resolveLocale } from '@/lib/i18n/locale';
import { withLocalizedDefaultSections } from '@/lib/utils/section-helpers';
import {
  type ResumePrintSearchParams,
  ResumePrintDocument,
  buildResumePrintSettings,
} from '@/lib/print/resume-print';
import type { ResumeData } from '@/components/dashboard/resume-component';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<ResumePrintSearchParams>;
};

async function fetchResumeData(id: string, token?: string): Promise<ResumeData> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/resumes?resume_id=${encodeURIComponent(id)}`, {
    cache: 'no-store',
    headers,
  });
  if (!res.ok) {
    throw new Error(`Failed to load resume (status ${res.status}).`);
  }
  const payload = (await res.json()) as {
    data: { processed_resume?: ResumeData; raw_resume?: { content?: string } };
  };
  if (payload.data.processed_resume) {
    return payload.data.processed_resume;
  }
  if (payload.data.raw_resume?.content) {
    try {
      return JSON.parse(payload.data.raw_resume.content) as ResumeData;
    } catch (error) {
      console.error('Failed to parse resume JSON:', {
        resumeId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
        contentLength: payload.data.raw_resume.content.length,
      });
      throw new Error('Failed to parse resume data. The resume content may be corrupted.');
    }
  }
  return {} as ResumeData;
}

export default async function PrintResumePage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const resumeData = await fetchResumeData(resolvedParams.id, resolvedSearchParams?.token);
  const locale = resolveLocale(resolvedSearchParams?.lang);
  const t = (key: string, values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const localizedResumeData = withLocalizedDefaultSections(resumeData, t);
  const settings = buildResumePrintSettings(resolvedSearchParams);

  return (
    <ResumePrintDocument
      resumeData={localizedResumeData}
      settings={settings}
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
