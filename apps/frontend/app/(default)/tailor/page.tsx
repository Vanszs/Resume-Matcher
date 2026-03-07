'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import type { ImprovedResult } from '@/components/common/resume_previewer_context';
import type { ResumeData } from '@/components/dashboard/resume-component';
import {
  uploadJobDescriptions,
  confirmImproveResume,
  fetchResumeList,
  startTailorTask,
  getTailorTaskStatus,
  type ResumeListItem,
} from '@/lib/api/resume';
import { fetchPromptConfig, type PromptOption } from '@/lib/api/config';
import { Dropdown } from '@/components/ui/dropdown';
import { useStatusCache } from '@/lib/context/status-cache';
import { Loader2, ArrowLeft, AlertTriangle, Settings } from 'lucide-react';
import { useNavigating } from '@/hooks/use-navigating';
import { useTranslations } from '@/lib/i18n';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TailorProgress } from '@/components/tailor/tailor-progress';

// ---------------------------------------------------------------------------
// Resumable tailor task — persist to localStorage so navigating away doesn't lose
// an in-flight backend task.
// ---------------------------------------------------------------------------
const TAILOR_TASK_STORAGE_KEY = 'tailor_active_task';

interface TailorTaskState {
  taskId: string;
  resumeId: string;
  startedAt: number; // Date.now() — for staleness check
}

// ---------------------------------------------------------------------------
// Shared polling utility — used by both runGenerate and handleAllRemovedTryKeywords
// ---------------------------------------------------------------------------
const MAX_TAILOR_POLLS = 90; // 90 × 2 s = 3 min hard timeout

async function pollTailorTask(
  taskId: string,
  abortRef: React.MutableRefObject<boolean>,
  generationRef: React.MutableRefObject<number>,
  generation: number,
  onProgress: (progress: number, stage: string) => void,
): Promise<ImprovedResult> {
  // True if user cancelled OR a newer generation has superseded this one.
  const isCancelled = () => abortRef.current || generationRef.current !== generation;

  let polls = 0;
  while (true) {
    if (isCancelled()) throw new DOMException('Aborted', 'AbortError');

    if (++polls > MAX_TAILOR_POLLS) {
      throw Object.assign(
        new Error('Task is taking too long. Please try again.'),
        { errorType: 'timeout' },
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (isCancelled()) throw new DOMException('Aborted', 'AbortError');

    const status = await getTailorTaskStatus(taskId);
    if (isCancelled()) throw new DOMException('Aborted', 'AbortError');

    onProgress(status.progress, status.stage);

    if (status.status === 'completed' && status.result) {
      if (isCancelled()) throw new DOMException('Aborted', 'AbortError');
      return { data: status.result as ImprovedResult['data'] };
    }
    if (status.status === 'failed') {
      const msg = status.error ?? 'Failed to preview resume. Please try again.';
      throw Object.assign(new Error(msg), { errorType: status.error_type });
    }
    // status === 'pending' | 'processing' — keep polling
  }
}

export default function TailorPage() {
  const { t } = useTranslations();
  const [jobDescription, setJobDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [masterResumeOptions, setMasterResumeOptions] = useState<ResumeListItem[]>([]);
  const [promptOptions, setPromptOptions] = useState<PromptOption[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState('keywords');
  const [promptLoading, setPromptLoading] = useState(false);
  const hasUserSelectedPrompt = useRef(false);
  const missingDiffConfirmInFlight = useRef(false);
  const confirmInFlight = useRef(false);
  const navigationInProgress = useRef(false);
  const abortRef = useRef(false);
  // Incremented on every new generate invocation — lets stale poll loops detect they
  // have been superseded even after abortRef has been reset for the new generation.
  const generationRef = useRef(0);
  const hasCheckedSavedTaskRef = useRef(false);
  const { isNavigating, navigateBack } = useNavigating();

  // Polling progress state
  const [tailorProgress, setTailorProgress] = useState(0);
  const [tailorStage, setTailorStage] = useState<string>('queued');

  // Diff preview modal state
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [pendingResult, setPendingResult] = useState<ImprovedResult | null>(null);
  const [diffConfirmError, setDiffConfirmError] = useState<string | null>(null);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showMissingDiffDialog, setShowMissingDiffDialog] = useState(false);
  const [missingDiffResult, setMissingDiffResult] = useState<ImprovedResult | null>(null);
  const [missingDiffError, setMissingDiffError] = useState<string | null>(null);
  const [showAllRemovedDialog, setShowAllRemovedDialog] = useState(false);

  const router = useRouter();
  const { setImprovedData } = useResumePreview();
  const {
    status: systemStatus,
    isLoading: statusLoading,
    incrementJobs,
    incrementImprovements,
    incrementResumes,
  } = useStatusCache();

  // Check if LLM is configured
  const isLlmConfigured = !statusLoading && systemStatus?.llm_configured;

  useEffect(() => {
    let cancelled = false;

    const loadMasters = async () => {
      try {
        const storedId = localStorage.getItem('master_resume_id');
        const resumes = await fetchResumeList(true);
        const masters = resumes.filter((resume) => resume.is_master);

        if (cancelled) return;

        if (masters.length === 0) {
          localStorage.removeItem('master_resume_id');
          router.push('/dashboard');
          return;
        }

        setMasterResumeOptions(masters);

        const storedMaster = masters.find((master) => master.resume_id === storedId);
        if (!storedMaster) {
          localStorage.removeItem('master_resume_id');
          router.push('/dashboard');
          return;
        }

        localStorage.setItem('master_resume_id', storedMaster.resume_id);
        setMasterResumeId(storedMaster.resume_id);
      } catch (err) {
        console.error('Failed to load master resumes', err);
        // Do not silently fall back to a stored id — redirect to dashboard
        // so the user can explicitly re-select a master resume.
        router.push('/dashboard');
      }
    };

    loadMasters();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    const loadPromptConfig = async () => {
      setPromptLoading(true);
      try {
        const config = await fetchPromptConfig();
        if (!cancelled) {
          setPromptOptions(config.prompt_options || []);
          if (!hasUserSelectedPrompt.current) {
            setSelectedPromptId(config.default_prompt_id || 'keywords');
          }
        }
      } catch (err) {
        console.error('Failed to load prompt config', err);
      } finally {
        if (!cancelled) {
          setPromptLoading(false);
        }
      }
    };

    loadPromptConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  // Check for a saved task from a previous navigation and resume polling if it's recent.
  // Runs once after masterResumeId is available so we can poll and eventually confirm.
  useEffect(() => {
    if (!masterResumeId || hasCheckedSavedTaskRef.current) return;
    hasCheckedSavedTaskRef.current = true;

    const checkSavedTask = async () => {
      const saved = localStorage.getItem(TAILOR_TASK_STORAGE_KEY);
      if (!saved) return;

      let task: TailorTaskState;
      try {
        task = JSON.parse(saved) as TailorTaskState;
      } catch {
        localStorage.removeItem(TAILOR_TASK_STORAGE_KEY);
        return;
      }

      // Treat tasks older than 5 minutes as stale — backend TTL will have removed them.
      if (!task.taskId || Date.now() - task.startedAt > 5 * 60 * 1000) {
        localStorage.removeItem(TAILOR_TASK_STORAGE_KEY);
        return;
      }

      await resumeExistingTask(task);
    };

    checkSavedTask();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterResumeId]);

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') e.stopPropagation();
  };

  const buildConfirmPayload = (result: ImprovedResult) => {
    if (!masterResumeId) {
      throw new Error('Master resume ID is missing.');
    }
    const resumePreview = result.data.resume_preview;
    if (!resumePreview || typeof resumePreview !== 'object' || Array.isArray(resumePreview)) {
      throw new Error('Resume preview data is invalid.');
    }
    const previewRecord = resumePreview as unknown as Record<string, unknown>;
    if (
      !previewRecord.personalInfo ||
      typeof previewRecord.personalInfo !== 'object' ||
      Array.isArray(previewRecord.personalInfo)
    ) {
      throw new Error('Resume preview data is invalid.');
    }
    return {
      resume_id: masterResumeId,
      job_id: result.data.job_id,
      improved_data: resumePreview as ResumeData,
      improvements:
        result.data.improvements?.map((item) => ({
          suggestion: item.suggestion,
          lineNumber: typeof item.lineNumber === 'number' ? item.lineNumber : null,
        })) ?? [],
    };
  };

  const confirmAndNavigate = async (result: ImprovedResult) => {
    const confirmed = await confirmImproveResume(buildConfirmPayload(result));
    incrementImprovements();
    incrementResumes();
    setImprovedData(confirmed);

    const newResumeId = confirmed?.data?.resume_id;
    navigationInProgress.current = true;
    if (newResumeId) {
      router.push(`/resumes/${newResumeId}`);
    } else {
      router.push('/builder');
    }
  };

  const getGenerateValidationError = (trimmedDescription: string) => {
    if (!trimmedDescription) return null;
    if (trimmedDescription.length < 50) {
      return t('tailor.errors.jobDescriptionTooShort');
    }
    return null;
  };

  // Classify a caught error and set the appropriate i18n error message in state.
  const handleTailorError = (err: unknown, context: string) => {
    // AbortError means user cancelled or a newer generation superseded this one — ignore silently.
    if (err instanceof Error && err.name === 'AbortError') return;
    if (abortRef.current) return;
    // Clear any saved task — it has failed or been superseded.
    localStorage.removeItem(TAILOR_TASK_STORAGE_KEY);
    const rawMessage = err instanceof Error ? err.message : String(err);
    const errorMessage = rawMessage.length > 500 ? rawMessage.slice(0, 500) + '…' : rawMessage;
    const errorType = (err as Record<string, unknown>).errorType as string | undefined;
    console.error(`[tailor] ${context} failed:`, { message: errorMessage, raw: err });

    if (errorMessage.includes('ALL_ENTRIES_REMOVED')) {
      setShowAllRemovedDialog(true);
      return;
    }
    if (
      errorType === 'timeout' ||
      errorMessage.toLowerCase().includes('timed out') ||
      errorMessage.toLowerCase().includes('request timed out') ||
      errorMessage.includes('524') ||
      errorMessage.includes('504')
    ) {
      setError(t('tailor.errors.timeout'));
    } else if (
      errorType === 'auth' ||
      errorMessage.toLowerCase().includes('api key') ||
      errorMessage.toLowerCase().includes('unauthorized') ||
      errorMessage.toLowerCase().includes('authentication') ||
      errorMessage.includes('401')
    ) {
      setError(t('tailor.errors.apiKeyError'));
    } else if (
      errorType === 'rate_limit' ||
      errorMessage.toLowerCase().includes('rate limit') ||
      errorMessage.includes('429')
    ) {
      setError(t('tailor.errors.rateLimit'));
    } else if (
      errorMessage.includes('503') ||
      errorMessage.toLowerCase().includes('service unavailable') ||
      errorMessage.toLowerCase().includes('temporarily unavailable')
    ) {
      setError(t('tailor.errors.serviceUnavailable'));
    } else {
      setError(t('tailor.errors.failedToPreview'));
    }
  };

  // Shared: handle a completed poll result — check diff and open appropriate modal.
  const handlePollResult = (result: ImprovedResult) => {
    // Clear the persisted task — it has now completed.
    localStorage.removeItem(TAILOR_TASK_STORAGE_KEY);
    if (!result?.data?.diff_summary || !result?.data?.detailed_changes) {
      console.warn('Diff data missing for tailor preview; requesting user confirmation.');
      setDiffConfirmError(null);
      setPendingResult(null);
      setShowDiffModal(false);
      setMissingDiffError(null);
      setMissingDiffResult(result);
      setShowMissingDiffDialog(true);
      return;
    }
    setDiffConfirmError(null);
    setMissingDiffError(null);
    setPendingResult(result);
    setShowDiffModal(true);
  };

  const runGenerate = async (resumeId: string, description: string) => {
    const generation = ++generationRef.current;
    abortRef.current = false;
    setTailorProgress(0);
    setTailorStage('queued');

    try {
      // 1. Upload Job Description
      const jobId = await uploadJobDescriptions([description], resumeId);
      if (abortRef.current || generationRef.current !== generation) return;
      incrementJobs();

      // 2. Start async tailor task — returns immediately with task_id
      const taskId = await startTailorTask(resumeId, jobId, selectedPromptId);
      if (abortRef.current || generationRef.current !== generation) return;

      // Persist task_id so the user can resume if they navigate away mid-poll.
      localStorage.setItem(
        TAILOR_TASK_STORAGE_KEY,
        JSON.stringify({ taskId, resumeId, startedAt: Date.now() } satisfies TailorTaskState),
      );

      // 3. Poll until the task completes or fails (max 3 min)
      const result = await pollTailorTask(taskId, abortRef, generationRef, generation, (progress, stage) => {
        setTailorProgress(progress);
        setTailorStage(stage);
      });
      if (abortRef.current || generationRef.current !== generation) return;
      handlePollResult(result);
    } catch (err) {
      handleTailorError(err, 'runGenerate');
    }
  };

  const resumeExistingTask = async (task: TailorTaskState) => {
    if (isLoading) return; // already busy
    const generation = ++generationRef.current;
    abortRef.current = false;
    setIsLoading(true);
    setTailorProgress(0);
    setTailorStage('resuming');
    setError(null);

    try {
      // Single poll to check if it completed while we were away.
      const status = await getTailorTaskStatus(task.taskId);
      if (abortRef.current || generationRef.current !== generation) return;

      if (status.status === 'completed' && status.result) {
        handlePollResult({ data: status.result as ImprovedResult['data'] });
        return;
      }
      if (status.status === 'failed') {
        localStorage.removeItem(TAILOR_TASK_STORAGE_KEY);
        const msg = status.error ?? t('tailor.errors.failedToPreview');
        setError(msg);
        return;
      }

      // Still running — continue polling.
      const result = await pollTailorTask(
        task.taskId,
        abortRef,
        generationRef,
        generation,
        (progress, stage) => {
          setTailorProgress(progress);
          setTailorStage(stage);
        },
      );
      if (abortRef.current || generationRef.current !== generation) return;
      handlePollResult(result);
    } catch (err) {
      localStorage.removeItem(TAILOR_TASK_STORAGE_KEY);
      handleTailorError(err, 'resumeExistingTask');
    } finally {
      if (!navigationInProgress.current) {
        setIsLoading(false);
      }
    }
  };

  const handleCancel = () => {
    abortRef.current = true;
    localStorage.removeItem(TAILOR_TASK_STORAGE_KEY);
    setIsLoading(false);
    setTailorProgress(0);
    setTailorStage('queued');
    setError(null);
  };

  const handleGenerate = async () => {
    const trimmedDescription = jobDescription.trim();
    if (!trimmedDescription || !masterResumeId) return;
    const validationError = getGenerateValidationError(trimmedDescription);
    if (validationError) {
      setError(validationError);
      return;
    }
    const resumeId = masterResumeId;
    setIsLoading(true);
    setError(null);
    try {
      await runGenerate(resumeId, trimmedDescription);
    } finally {
      setIsLoading(false);
    }
  };

  // User confirms changes
  const handleConfirmChanges = async () => {
    // Guard against double-clicks - isLoading already tracks confirm in progress
    if (!pendingResult || isLoading || confirmInFlight.current) return;

    confirmInFlight.current = true;
    setIsLoading(true);
    setError(null);
    setDiffConfirmError(null);

    try {
      await confirmAndNavigate(pendingResult);
      setShowDiffModal(false);
      setPendingResult(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[tailor] handleConfirmChanges failed:', { message: errorMessage, raw: err });
      const msg = t('tailor.errors.failedToConfirm');
      setError(msg);
      setDiffConfirmError(msg);
    } finally {
      confirmInFlight.current = false;
      if (!navigationInProgress.current) {
        setIsLoading(false);
      }
    }
  };

  // User rejects changes
  const handleRejectChanges = () => {
    setShowDiffModal(false);
    setPendingResult(null);
    setDiffConfirmError(null);
    setShowRegenerateDialog(true);
  };

  const handleCloseDiffModal = () => {
    setShowDiffModal(false);
    setPendingResult(null);
    setDiffConfirmError(null);
  };

  const handleCloseMissingDiffDialog = () => {
    if (isLoading) return;
    setShowMissingDiffDialog(false);
    setMissingDiffResult(null);
    setMissingDiffError(null);
    missingDiffConfirmInFlight.current = false;
  };

  const handleMissingDiffConfirm = async () => {
    if (!missingDiffResult || isLoading || missingDiffConfirmInFlight.current) return;
    missingDiffConfirmInFlight.current = true;
    setIsLoading(true);
    setError(null);
    setMissingDiffError(null);
    try {
      await confirmAndNavigate(missingDiffResult);
      handleCloseMissingDiffDialog();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[tailor] handleMissingDiffConfirm failed:', { message: errorMessage, raw: err });
      const msg = t('tailor.errors.failedToConfirm');
      setError(msg);
      setMissingDiffError(msg);
    } finally {
      missingDiffConfirmInFlight.current = false;
      if (!navigationInProgress.current) {
        setIsLoading(false);
      }
    }
  };

  const handleRegenerateConfirm = async () => {
    setShowRegenerateDialog(false);
    const trimmedDescription = jobDescription.trim();
    if (!trimmedDescription || !masterResumeId) return;
    const validationError = getGenerateValidationError(trimmedDescription);
    if (validationError) {
      setError(validationError);
      return;
    }
    const resumeId = masterResumeId;
    setIsLoading(true);
    setError(null);
    try {
      await runGenerate(resumeId, trimmedDescription);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAllRemovedTryKeywords = async () => {
    setShowAllRemovedDialog(false);
    hasUserSelectedPrompt.current = true;
    setSelectedPromptId('keywords');
    const trimmedDescription = jobDescription.trim();
    if (!trimmedDescription || !masterResumeId) return;
    const resumeId = masterResumeId;
    const generation = ++generationRef.current;
    abortRef.current = false;
    setTailorProgress(0);
    setTailorStage('queued');
    setIsLoading(true);
    setError(null);
    try {
      // Use 'keywords' explicitly — React state update for selectedPromptId
      // may not have propagated yet at this point in the async flow.
      const jobId = await uploadJobDescriptions([trimmedDescription], resumeId);
      if (abortRef.current || generationRef.current !== generation) return;
      incrementJobs();
      const taskId = await startTailorTask(resumeId, jobId, 'keywords');
      if (abortRef.current || generationRef.current !== generation) return;

      const result = await pollTailorTask(taskId, abortRef, generationRef, generation, (progress, stage) => {
        setTailorProgress(progress);
        setTailorStage(stage);
      });
      if (abortRef.current || generationRef.current !== generation) return;
      handlePollResult(result);
    } catch (err) {
      handleTailorError(err, 'handleAllRemovedTryKeywords');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-[#F6F5EE] flex flex-col items-center justify-center p-4 md:p-8 font-sans"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="w-full max-w-4xl bg-white border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] p-8 md:p-12 lg:p-14 relative">
        {/* Back Button */}
        <Button variant="link" className="absolute top-4 left-4" disabled={isNavigating} onClick={navigateBack}>
          {isNavigating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeft className="w-4 h-4" />}
          {t('common.back')}
        </Button>

        <div className="mb-8 mt-4 text-center">
          <h1 className="font-serif text-4xl font-bold uppercase tracking-tight mb-2">
            {t('tailor.heroTitle')}
          </h1>
          <p className="font-mono text-sm text-blue-700 font-bold uppercase">
            {'// '}
            {t('tailor.pasteJobDescriptionBelow')}
          </p>
        </div>

        {/* LLM Not Configured Warning */}
        {!statusLoading && !isLlmConfigured && (
          <div className="mb-6 border-2 border-amber-500 bg-amber-50 p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-mono text-sm font-bold uppercase tracking-wider text-amber-800">
                  {t('tailor.setupRequiredTitle')}
                </p>
                <p className="font-mono text-xs text-amber-700 mt-1">
                  {t('tailor.noApiKeyMessage')}
                </p>
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-2 mt-3 text-amber-700 hover:text-amber-900 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span className="font-mono text-xs font-bold uppercase underline">
                    {t('tailor.configureApiKey')}
                  </span>
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <Dropdown
            options={masterResumeOptions.map((master) => ({
              id: master.resume_id,
              label: master.title || master.filename || t('dashboard.masterResume'),
              description: t('dashboard.masterResume'),
            }))}
            value={masterResumeId || ''}
            onChange={(value) => {
              setMasterResumeId(value);
              localStorage.setItem('master_resume_id', value);
            }}
            label={t('tailor.masterResumeLabel')}
            description={t('tailor.masterResumeDescription')}
            disabled={isLoading || masterResumeOptions.length === 0}
          />

          <Dropdown
            options={
              promptOptions.length > 0
                ? promptOptions.map((opt) => ({
                    id: opt.id,
                    label: t(`tailor.promptOptions.${opt.id}.label`),
                    description: t(`tailor.promptOptions.${opt.id}.description`),
                  }))
                : [
                    {
                      id: 'nudge',
                      label: t('tailor.promptOptions.nudge.label'),
                      description: t('tailor.promptOptions.nudge.description'),
                    },
                    {
                      id: 'keywords',
                      label: t('tailor.promptOptions.keywords.label'),
                      description: t('tailor.promptOptions.keywords.description'),
                    },
                    {
                      id: 'full',
                      label: t('tailor.promptOptions.full.label'),
                      description: t('tailor.promptOptions.full.description'),
                    },
                    {
                      id: 'focused',
                      label: t('tailor.promptOptions.focused.label'),
                      description: t('tailor.promptOptions.focused.description'),
                    },
                  ]
            }
            value={selectedPromptId}
            onChange={(value) => {
              hasUserSelectedPrompt.current = true;
              setSelectedPromptId(value);
            }}
            label={t('tailor.promptLabel')}
            description={t('tailor.promptDescription')}
            disabled={isLoading || promptLoading}
          />

          {/* Focused tailoring warning banner */}
          {selectedPromptId === 'focused' && (
            <div className="border-2 border-amber-500 bg-amber-50 p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="font-mono text-xs text-amber-800">
                  {t('tailor.focusedWarning')}
                </p>
              </div>
            </div>
          )}

          <div className="relative">
            <Textarea
              placeholder={t('tailor.jobDescriptionPlaceholder')}
              className="min-h-[300px] font-mono text-sm bg-[#F0F0E8] border-2 border-black focus:ring-0 focus:border-blue-700 resize-none p-4 rounded-none"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              disabled={isLoading}
            />
            <div className="absolute bottom-2 right-2 text-xs font-mono text-gray-400 pointer-events-none">
              {t('tailor.charactersCount', { count: jobDescription.length })}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-mono flex items-center gap-2">
              <span>!</span> {error}
            </div>
          )}

          {/* Progress bar shown while polling is active */}
          {isLoading && (
            <TailorProgress
              progress={tailorProgress}
              stage={tailorStage}
              onCancel={handleCancel}
            />
          )}

          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={
              isLoading ||
              statusLoading ||
              !jobDescription.trim() ||
              !isLlmConfigured ||
              !masterResumeId
            }
            className="w-full"
          >
            {statusLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('common.checking')}
              </>
            ) : !isLlmConfigured ? (
              t('tailor.configureApiKeyFirst')
            ) : isLoading ? (
              t('tailor.generateTailored')
            ) : (
              t('tailor.generateTailored')
            )}
          </Button>
        </div>
      </div>

      {/* Diff preview modal */}
      {showDiffModal && pendingResult && (
        <DiffPreviewModal
          isOpen={showDiffModal}
          onClose={handleCloseDiffModal}
          onReject={handleRejectChanges}
          onConfirm={handleConfirmChanges}
          isSubmitting={isLoading}
          diffSummary={pendingResult?.data?.diff_summary}
          detailedChanges={pendingResult?.data?.detailed_changes}
          removedEntries={pendingResult?.data?.removed_entries}
          promptId={selectedPromptId}
          errorMessage={diffConfirmError ?? undefined}
        />
      )}

      <ConfirmDialog
        open={showRegenerateDialog}
        onOpenChange={setShowRegenerateDialog}
        title={t('tailor.regenerateDialog.title')}
        description={t('tailor.regenerateDialog.description')}
        confirmLabel={t('tailor.regenerateDialog.confirmLabel')}
        cancelLabel={t('common.cancel')}
        variant="warning"
        onConfirm={handleRegenerateConfirm}
      />

      <ConfirmDialog
        open={showMissingDiffDialog}
        onOpenChange={(open) => {
          if (!open && !isLoading) {
            handleCloseMissingDiffDialog();
          }
        }}
        title={t('tailor.missingDiffDialog.title')}
        description={t('tailor.missingDiffDialog.description')}
        confirmLabel={t('tailor.missingDiffDialog.confirmLabel')}
        cancelLabel={t('common.cancel')}
        variant="warning"
        closeOnConfirm={false}
        onConfirm={handleMissingDiffConfirm}
        onCancel={handleCloseMissingDiffDialog}
        confirmLoading={isLoading}
        confirmDisabled={isLoading || !missingDiffResult}
        errorMessage={missingDiffError ?? undefined}
      />

      {/* All entries removed dialog (focused mode only) */}
      <ConfirmDialog
        open={showAllRemovedDialog}
        onOpenChange={(open) => {
          if (!open && !isLoading) setShowAllRemovedDialog(false);
        }}
        title={t('tailor.allRemovedDialog.title')}
        description={t('tailor.allRemovedDialog.description')}
        confirmLabel={t('tailor.allRemovedDialog.tryKeywords')}
        cancelLabel={t('common.close')}
        variant="warning"
        onConfirm={handleAllRemovedTryKeywords}
        onCancel={() => setShowAllRemovedDialog(false)}
        confirmLoading={isLoading}
      />
    </div>
  );
}
