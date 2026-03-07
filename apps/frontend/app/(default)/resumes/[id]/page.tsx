'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useNavigating } from '@/hooks/use-navigating';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import Resume, { ResumeData } from '@/components/dashboard/resume-component';

import {
  fetchResume,
  fetchResumeList,
  downloadResumePdf,
  getResumePdfUrl,
  deleteResume,
  retryProcessing,
  renameResume,
} from '@/lib/api/resume';

import { useStatusCache } from '@/lib/context/status-cache';
import { ArrowLeft, Edit, Download, Loader2, AlertCircle, Sparkles, Pencil } from 'lucide-react';
import { EnrichmentModal } from '@/components/enrichment/enrichment-modal';
import { useTranslations } from '@/lib/i18n';
import { withLocalizedDefaultSections } from '@/lib/utils/section-helpers';
import { useLanguage } from '@/lib/context/language-context';
import { downloadBlobAsFile, openUrlInNewTab, sanitizeFilename } from '@/lib/utils/download';
import { sanitizeTitle } from '@/lib/utils/title';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export default function ResumeViewerPage() {
  const { t } = useTranslations();
  const { uiLanguage } = useLanguage();
  const params = useParams();
  const { decrementResumes, setHasMasterResume } = useStatusCache();
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [isMasterResume, setIsMasterResume] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteSuccessDialog, setShowDeleteSuccessDialog] = useState(false);
  const [showDownloadSuccessDialog, setShowDownloadSuccessDialog] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showEnrichmentModal, setShowEnrichmentModal] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [rawErrorDetail, setRawErrorDetail] = useState<string | null>(null);
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const { isNavigating, navigateTo } = useNavigating();
  const [resumeTitle, setResumeTitle] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');

  const resumeId = params?.id as string;

  const localizedResumeData = useMemo(() => {
    if (!resumeData) return null;
    return withLocalizedDefaultSections(resumeData, t);
  }, [resumeData, t]);

  useEffect(() => {
    if (!resumeId) return;

    const loadResume = async () => {
      try {
        setLoading(true);
        setError(null);
        const [data, resumes] = await Promise.all([
          fetchResume(resumeId),
          fetchResumeList(true).catch(() => []),
        ]);

        // Get processing status
        const status = (data.raw_resume?.processing_status || 'pending') as ProcessingStatus;
        setProcessingStatus(status);
        setIsMasterResume(
          resumes.some((resume) => resume.resume_id === resumeId && resume.is_master)
        );

        // Capture title for editable display (always set to clear stale state)
        setResumeTitle(data.title ?? null);

        // Prioritize processed_resume if available (structured JSON)
        if (data.processed_resume) {
          const pd = data.processed_resume as ResumeData;
          // Treat completely empty LLM output (no name, no sections) as failed
          const hasContent =
            pd.personalInfo?.name ||
            (Array.isArray(pd.workExperience) && pd.workExperience.length > 0) ||
            (Array.isArray(pd.sectionMeta) && pd.sectionMeta.length > 0) ||
            (Array.isArray(pd.education) && pd.education.length > 0);
          if (hasContent) {
            setResumeData(pd);
            setError(null);
          } else {
            // processed_resume exists but is empty — treat as failed so retry button shows
            setProcessingStatus('failed');
            setError(t('resumeViewer.errors.processingFailed'));
          }
        } else if (status === 'failed') {
          const rawErr = data.raw_resume?.error_message;
          setRawErrorDetail(rawErr ?? null);
          setShowErrorDetail(false);
          setError(t('resumeViewer.errors.processingFailed'));
        } else if (status === 'processing') {
          setError(t('resumeViewer.errors.stillProcessing'));
        } else if (data.raw_resume?.content) {
          // Try to parse raw_resume content as JSON (for tailored resumes stored as JSON)
          try {
            const parsed = JSON.parse(data.raw_resume.content);
            setResumeData(parsed as ResumeData);
          } catch {
            setError(t('resumeViewer.errors.notProcessedYet'));
          }
        } else {
          setError(t('resumeViewer.errors.noDataAvailable'));
        }
      } catch (err) {
        console.error('Failed to load resume:', err);
        setError(t('resumeViewer.errors.failedToLoad'));
      } finally {
        setLoading(false);
      }
    };

    loadResume();
  }, [resumeId, t]);

  // Auto-poll every 3 s while background LLM processing is in progress.
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const POLL_TIMEOUT_MS = 10 * 60 * 1000; // stop after 10 minutes — treat as stuck
  useEffect(() => {
    if (processingStatus !== 'processing') {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }
    pollStartRef.current = Date.now();
    pollingRef.current = setInterval(async () => {
      // Stop polling if record is stuck for too long — let user retry manually.
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
        setProcessingStatus('failed');
        setError(t('resumeViewer.errors.processingFailed'));
        return;
      }
      try {
        const data = await fetchResume(resumeId);
        const newStatus = (data.raw_resume?.processing_status || 'pending') as ProcessingStatus;
        if (newStatus === 'ready') {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setProcessingStatus('ready');
          if (data.processed_resume) {
            const pd = data.processed_resume as ResumeData;
            const hasContent =
              pd.personalInfo?.name ||
              (Array.isArray(pd.workExperience) && pd.workExperience.length > 0) ||
              (Array.isArray(pd.sectionMeta) && pd.sectionMeta.length > 0) ||
              (Array.isArray(pd.education) && pd.education.length > 0);
            if (hasContent) {
              setResumeData(pd);
              setError(null);
            } else {
              setProcessingStatus('failed');
              setError(t('resumeViewer.errors.processingFailed'));
            }
          } else {
            setError(t('resumeViewer.errors.noDataAvailable'));
          }
        } else if (newStatus === 'failed') {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setProcessingStatus('failed');
          const rawErr = data.raw_resume?.error_message;
          setRawErrorDetail(rawErr ?? null);
          setShowErrorDetail(false);
          setError(t('resumeViewer.errors.processingFailed'));
        }
      } catch {
        // ignore transient poll errors
      }
    }, 3000);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [processingStatus, resumeId, t]);

  const handleRetryProcessing = async () => {
    if (!resumeId) return;
    // Stop the background polling before triggering a manual retry.
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsRetrying(true);
    try {
      const result = await retryProcessing(resumeId);
      if (result.processing_status === 'ready') {
        // Reload the page to show the processed resume
        window.location.reload();
      } else {
        setProcessingStatus('failed');
        const rawErr = result.error_message;
        setRawErrorDetail(rawErr ?? null);
        setShowErrorDetail(false);
        setError(t('resumeViewer.errors.processingFailed'));
      }
    } catch (err) {
      console.error('Retry processing failed:', err);
      setError(t('resumeViewer.errors.processingFailed'));
    } finally {
      setIsRetrying(false);
    }
  };

  const handleEdit = () => {
    navigateTo(`/builder?id=${resumeId}`);
  };

  const handleTitleSave = async () => {
    const trimmed = editingTitleValue.trim();
    if (!trimmed || trimmed === resumeTitle) {
      setIsEditingTitle(false);
      return;
    }
    try {
      await renameResume(resumeId, trimmed);
      setResumeTitle(trimmed);
    } catch (err) {
      console.error('Failed to rename resume:', err);
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
    }
  };

  // Reload resume data after enrichment
  const reloadResumeData = async () => {
    try {
      const data = await fetchResume(resumeId);
      if (data.processed_resume) {
        const pd = data.processed_resume as ResumeData;
        const hasContent =
          pd.personalInfo?.name ||
          (Array.isArray(pd.workExperience) && pd.workExperience.length > 0) ||
          (Array.isArray(pd.sectionMeta) && pd.sectionMeta.length > 0) ||
          (Array.isArray(pd.education) && pd.education.length > 0);
        if (hasContent) {
          setResumeData(pd);
          setError(null);
        } else {
          setProcessingStatus('failed');
          setError(t('resumeViewer.errors.processingFailed'));
        }
      }
    } catch (err) {
      console.error('Failed to reload resume:', err);
    }
  };

  const handleEnrichmentComplete = () => {
    setShowEnrichmentModal(false);
    reloadResumeData();
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const blob = await downloadResumePdf(resumeId, undefined, uiLanguage);
      const filename = sanitizeFilename(resumeTitle, resumeId, 'resume');
      downloadBlobAsFile(blob, filename);
      setShowDownloadSuccessDialog(true);
    } catch (err) {
      console.error('Failed to download resume:', err);
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        const fallbackUrl = getResumePdfUrl(resumeId, undefined, uiLanguage);
        const didOpen = openUrlInNewTab(fallbackUrl);
        if (!didOpen) {
          alert(t('common.popupBlocked', { url: fallbackUrl }));
        }
        return;
      }
      setDownloadError(t('resumeViewer.errors.downloadFailed'));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDeleteResume = async () => {
    try {
      setDeleteError(null);
      await deleteResume(resumeId);
      // Update cached counters
      decrementResumes();
      if (isMasterResume) {
        const resumes = await fetchResumeList(true).catch(() => []);
        const remainingMasters = resumes.filter((resume) => resume.is_master);
        const currentMasterId = localStorage.getItem('master_resume_id');

        if (currentMasterId === resumeId) {
          if (remainingMasters.length > 0) {
            localStorage.setItem('master_resume_id', remainingMasters[0].resume_id);
          } else {
            localStorage.removeItem('master_resume_id');
          }
        }

        setHasMasterResume(remainingMasters.length > 0);
      }
      setShowDeleteDialog(false);
      setShowDeleteSuccessDialog(true);
    } catch (err) {
      console.error('Failed to delete resume:', err);
      setDeleteError(t('resumeViewer.errors.failedToDelete'));
      setShowDeleteDialog(false);
    }
  };

  const handleGoToDashboard = () => {
    navigateTo('/dashboard');
  };

  const handleDeleteSuccessConfirm = () => {
    setShowDeleteSuccessDialog(false);
    handleGoToDashboard();
  };

  const handleDownloadSuccessConfirm = () => {
    setShowDownloadSuccessDialog(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F0E8]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-700 mb-4" />
        <p className="font-mono text-sm font-bold uppercase text-blue-700">
          {t('resumeViewer.loading')}
        </p>
      </div>
    );
  }

  if (error || !resumeData) {
    const isProcessing = processingStatus === 'processing';
    const isFailed = processingStatus === 'failed';

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F0E8] p-4">
        <div
          className={`border p-6 text-center max-w-md shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] ${
            isProcessing
              ? 'bg-blue-50 border-blue-200'
              : isFailed
                ? 'bg-orange-50 border-orange-200'
                : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex justify-center mb-4">
            {isProcessing ? (
              <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
            ) : isFailed ? (
              <AlertCircle className="w-8 h-8 text-orange-600" />
            ) : (
              <AlertCircle className="w-8 h-8 text-red-600" />
            )}
          </div>
          <p
            className={`font-bold mb-4 ${
              isProcessing ? 'text-blue-700' : isFailed ? 'text-orange-700' : 'text-red-700'
            }`}
          >
            {error || t('resumeViewer.resumeNotFound')}
          </p>
          {isFailed && rawErrorDetail && (
            <div className="mb-4 text-left">
              <button
                type="button"
                className="font-mono text-xs uppercase underline underline-offset-2 text-orange-700 hover:text-orange-900 transition-colors"
                onClick={() => setShowErrorDetail((v) => !v)}
              >
                {showErrorDetail
                  ? t('dashboard.hideErrorDetail')
                  : t('dashboard.showErrorDetail')}
              </button>
              {showErrorDetail && (
                <pre className="mt-2 p-2 bg-orange-100/50 border border-orange-200 text-xs font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto text-orange-900">
                  {rawErrorDetail}
                </pre>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {/* Show retry+delete for both stuck-processing AND failed resumes */}
            {(isFailed || isProcessing) && (
              <>
                <Button onClick={handleRetryProcessing} disabled={isRetrying}>
                  {isRetrying ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('common.processing')}
                    </>
                  ) : (
                    t('resumeViewer.retryProcessing')
                  )}
                </Button>
                <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                  {t('resumeViewer.deleteAndStartOver')}
                </Button>
              </>
            )}
            <Button variant="outline" onClick={handleGoToDashboard} disabled={isNavigating}>
              {isNavigating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('resumeViewer.returnToDashboard')
              )}
            </Button>
          </div>

          {/* Delete confirm dialog — must be rendered here since this is an early return */}
          <ConfirmDialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
            title={t('dashboard.deleteResume')}
            description={t('confirmations.deleteResumeFromSystemDescription')}
            confirmLabel={t('confirmations.deleteResumeConfirmLabel')}
            cancelLabel={t('confirmations.keepResumeCancelLabel')}
            onConfirm={handleDeleteResume}
            variant="danger"
          />
          <ConfirmDialog
            open={showDeleteSuccessDialog}
            onOpenChange={setShowDeleteSuccessDialog}
            title={t('resumeViewer.deletedTitle')}
            description={t('resumeViewer.deletedDescriptionRegular')}
            confirmLabel={t('resumeViewer.returnToDashboard')}
            onConfirm={handleDeleteSuccessConfirm}
            variant="success"
            showCancelButton={false}
          />
          {deleteError && (
            <ConfirmDialog
              open={!!deleteError}
              onOpenChange={() => setDeleteError(null)}
              title={t('resumeViewer.deleteFailedTitle')}
              description={deleteError}
              confirmLabel={t('common.ok')}
              onConfirm={() => setDeleteError(null)}
              variant="danger"
              showCancelButton={false}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F0E8] py-12 px-4 md:px-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header Actions */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
          <Button variant="outline" onClick={handleGoToDashboard} disabled={isNavigating}>
            {isNavigating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowLeft className="w-4 h-4" />
            )}
            {t('nav.backToDashboard')}
          </Button>

          <div className="flex gap-3">
            {isMasterResume && (
              <Button onClick={() => setShowEnrichmentModal(true)} className="gap-2">
                <Sparkles className="w-4 h-4" />
                {t('resumeViewer.enhanceResume')}
              </Button>
            )}
            <Button variant="outline" onClick={handleEdit} disabled={isNavigating}>
              {isNavigating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit className="w-4 h-4" />}
              {t('dashboard.editResume')}
            </Button>
            <Button variant="success" onClick={handleDownload} disabled={isDownloading}>
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isDownloading ? t('common.loading') : t('resumeViewer.downloadResume')}
            </Button>
          </div>
        </div>

        {/* Editable Title */}
        <div className="mb-6 no-print">
            {isEditingTitle ? (
              <input
                type="text"
                value={editingTitleValue}
                onChange={(e) => setEditingTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                autoFocus
                maxLength={80}
                placeholder={t('resumeViewer.titlePlaceholder')}
                className="font-serif text-2xl font-bold border-b-2 border-black bg-transparent outline-none w-full max-w-xl px-0 py-1"
              />
            ) : (
              <button
                onClick={() => {
                  setEditingTitleValue(resumeTitle || '');
                  setIsEditingTitle(true);
                }}
                className="group flex items-center gap-2 cursor-pointer bg-transparent border-none p-0"
              >
                <h2
                  className={`font-serif text-2xl font-bold border-b-2 border-transparent group-hover:border-black transition-colors ${!sanitizeTitle(resumeTitle) ? 'text-gray-400' : ''}`}
                >
                  {sanitizeTitle(resumeTitle) || t('resumeViewer.titlePlaceholder')}
                </h2>
                <Pencil
                  className={`w-4 h-4 transition-opacity ${sanitizeTitle(resumeTitle) ? 'opacity-0 group-hover:opacity-60' : 'opacity-40 group-hover:opacity-60'}`}
                />
              </button>
            )}
          </div>

        {/* Resume Viewer */}
        <div className="flex justify-center pb-4">
          <div className="resume-print w-full max-w-[250mm] shadow-[8px_8px_0px_0px_#000000] border-2 border-black bg-white">
            <Resume
              resumeData={localizedResumeData || resumeData}
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
              fallbackLabels={{ name: t('resume.defaults.name') }}
            />
          </div>
        </div>

        <div className="flex justify-end pt-4 no-print">
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            {isMasterResume
              ? t('confirmations.deleteMasterResumeTitle')
              : t('dashboard.deleteResume')}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={
          isMasterResume ? t('confirmations.deleteMasterResumeTitle') : t('dashboard.deleteResume')
        }
        description={
          isMasterResume
            ? t('confirmations.deleteMasterResumeDescription')
            : t('confirmations.deleteResumeFromSystemDescription')
        }
        confirmLabel={t('confirmations.deleteResumeConfirmLabel')}
        cancelLabel={t('confirmations.keepResumeCancelLabel')}
        onConfirm={handleDeleteResume}
        variant="danger"
      />

      <ConfirmDialog
        open={showDeleteSuccessDialog}
        onOpenChange={setShowDeleteSuccessDialog}
        title={t('resumeViewer.deletedTitle')}
        description={
          isMasterResume
            ? t('resumeViewer.deletedDescriptionMaster')
            : t('resumeViewer.deletedDescriptionRegular')
        }
        confirmLabel={t('resumeViewer.returnToDashboard')}
        onConfirm={handleDeleteSuccessConfirm}
        variant="success"
        showCancelButton={false}
      />

      <ConfirmDialog
        open={showDownloadSuccessDialog}
        onOpenChange={setShowDownloadSuccessDialog}
        title={t('common.success')}
        description={t('builder.alerts.downloadSuccess')}
        confirmLabel={t('common.ok')}
        onConfirm={handleDownloadSuccessConfirm}
        variant="success"
        showCancelButton={false}
      />

      {downloadError && (
        <ConfirmDialog
          open={!!downloadError}
          onOpenChange={() => setDownloadError(null)}
          title={t('common.error')}
          description={downloadError}
          confirmLabel={t('common.ok')}
          onConfirm={() => setDownloadError(null)}
          variant="danger"
          showCancelButton={false}
        />
      )}

      {deleteError && (
        <ConfirmDialog
          open={!!deleteError}
          onOpenChange={() => setDeleteError(null)}
          title={t('resumeViewer.deleteFailedTitle')}
          description={deleteError}
          confirmLabel={t('common.ok')}
          onConfirm={() => setDeleteError(null)}
          variant="danger"
          showCancelButton={false}
        />
      )}

      {/* Enrichment Modal - Only for master resume */}
      {isMasterResume && (
        <EnrichmentModal
          resumeId={resumeId}
          isOpen={showEnrichmentModal}
          onClose={() => setShowEnrichmentModal(false)}
          onComplete={handleEnrichmentComplete}
        />
      )}
    </div>
  );
}
