'use client';

import { SwissGrid } from '@/components/home/swiss-grid';
import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n';

// Optimized Imports for Performance (No Barrel Imports)
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Settings from 'lucide-react/dist/esm/icons/settings';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';

import {
  fetchResume,
  fetchResumeList,
  deleteResume,
  retryProcessing,
  fetchJobDescription,
  type ResumeListItem,
} from '@/lib/api/resume';
import { useStatusCache } from '@/lib/context/status-cache';
import { API_BASE } from '@/lib/api/client';
import { useNavigating } from '@/hooks/use-navigating';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'loading';
type ResumeProcessingStatus = ResumeListItem['processing_status'];

const VALID_RESUME_PROCESSING_STATUSES: readonly ResumeProcessingStatus[] = [
  'pending',
  'processing',
  'ready',
  'failed',
];

function asResumeProcessingStatus(value: unknown): ResumeProcessingStatus | null {
  return typeof value === 'string' &&
    (VALID_RESUME_PROCESSING_STATUSES as readonly string[]).includes(value)
    ? (value as ResumeProcessingStatus)
    : null;
}

const RESUME_LIST_CACHE_KEY = 'rm_dashboard_cache';

interface ResumeListCache {
  masterId: string | null;
  tailored: ResumeListItem[];
  masters: ResumeListItem[];
}

function readResumeCache(): ResumeListCache | null {
  try {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem(RESUME_LIST_CACHE_KEY) : null;
    if (!raw) return null;
    return JSON.parse(raw) as ResumeListCache;
  } catch {
    return null;
  }
}

const TRANSIENT_STATES = new Set(['processing', 'pending']);

function writeResumeCache(data: ResumeListCache, masterProcessingStatus?: string): void {
  try {
    // Don't cache while anything is still being processed —
    // on next back-navigation we want a fresh fetch instead of
    // a stale "processing" label frozen in storage.
    const masterTransient = (masterProcessingStatus
      ? TRANSIENT_STATES.has(masterProcessingStatus)
      : false) || data.masters.some((r) => TRANSIENT_STATES.has(r.processing_status ?? ''));
    const tailoredTransient = data.tailored.some((r) =>
      TRANSIENT_STATES.has(r.processing_status ?? '')
    );
    if (masterTransient || tailoredTransient) {
      sessionStorage.removeItem(RESUME_LIST_CACHE_KEY);
      return;
    }
    sessionStorage.setItem(RESUME_LIST_CACHE_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage unavailable (private browsing / quota exceeded) — silent fail
  }
}

export default function DashboardPage() {
  const { t, locale } = useTranslations();
  // Lazy-initialize from cache/localStorage so first render already has data
  const [masterResumeId, setMasterResumeId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const cached = readResumeCache();
    return cached?.masterId ?? localStorage.getItem('master_resume_id');
  });
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('loading');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tailoredResumes, setTailoredResumes] = useState<ResumeListItem[]>(() => {
    if (typeof window === 'undefined') return [];
    return readResumeCache()?.tailored ?? [];
  });
  const [masterResumes, setMasterResumes] = useState<ResumeListItem[]>(() => {
    if (typeof window === 'undefined') return [];
    return readResumeCache()?.masters ?? [];
  });
  // isListLoading = true only when there is NO cache at all (genuine first-ever load)
  const [isListLoading, setIsListLoading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return readResumeCache() === null;
  });
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeletingMaster, setIsDeletingMaster] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const { isNavigating, navigatingTo, navigateTo } = useNavigating();

  // Status cache for optimistic counter updates and LLM status check
  const {
    status: systemStatus,
    isLoading: statusLoading,
    incrementResumes,
    decrementResumes,
    setHasMasterResume,
  } = useStatusCache();

  // Request id guard for concurrent loadTailoredResumes invocations
  const loadRequestIdRef = useRef(0);
  // Lightweight in-memory cache for job snippets to avoid N+1 refetches
  const jobSnippetCacheRef = useRef<Record<string, string>>({});
  // Track latest master processing status for use inside loadTailoredResumes callback
  const masterProcessingStatusRef = useRef<string>(processingStatus);
  useEffect(() => {
    masterProcessingStatusRef.current = processingStatus;
  }, [processingStatus]);

  // Check if LLM is configured (API key is set)
  const isLlmConfigured = !statusLoading && systemStatus?.llm_configured;

  const isTailorEnabled =
    Boolean(masterResumeId) && processingStatus === 'ready' && isLlmConfigured;

  const formatDate = (value: string) => {
    if (!value) return t('common.unknown');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t('common.unknown');

    const dateLocale =
      locale === 'es' ? 'es-ES' : locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';

    return date.toLocaleDateString(dateLocale, {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  };

  const checkResumeStatus = useCallback(async (resumeId: string) => {
    try {
      setProcessingStatus('loading');
      const data = await fetchResume(resumeId);
      const status = data.raw_resume?.processing_status || 'pending';
      setProcessingStatus(status as ProcessingStatus);
    } catch (err: unknown) {
      console.error('Failed to check resume status:', err);
      // If resume not found (404), clear the stale localStorage
      if (err instanceof Error && err.message.includes('404')) {
        localStorage.removeItem('master_resume_id');
        setMasterResumeId(null);
        return;
      }
      setProcessingStatus('failed');
    }
  }, []);

  // Silent version — used by polling and background refreshes.
  // Does NOT set status to 'loading' first so there’s no spinner flash.
  const silentCheckMasterStatus = useCallback(async (resumeId: string) => {
    try {
      const data = await fetchResume(resumeId);
      const status = data.raw_resume?.processing_status || 'pending';
      setProcessingStatus(status as ProcessingStatus);
    } catch (err: unknown) {
      // On 404, clear stale id — same as the non-silent version
      if (err instanceof Error && err.message.includes('404')) {
        localStorage.removeItem('master_resume_id');
        setMasterResumeId(null);
      }
    }
  }, []);

  // On mount, kick off a status check for the lazily-initialized master resume
  useEffect(() => {
    if (masterResumeId) {
      checkResumeStatus(masterResumeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally omit deps — runs once with the lazy-init value

  const loadTailoredResumes = useCallback(async () => {
    try {
      const data = await fetchResumeList(true);
      const masters = data.filter((r) => r.is_master);
      setMasterResumes(masters);
      const storedId = localStorage.getItem('master_resume_id');
      const storedMaster = masters.find((r) => r.resume_id === storedId);

      // Helper: pick the most-recently-updated item from a list
      const pickLatest = (list: ResumeListItem[]) =>
        [...list].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )[0];

      // Resolution order:
      //  1. Previously stored selection (still exists in the list)
      //  2. Latest master with status 'ready'
      //  3. Latest master of any status
      //  4. null (no masters at all)
      const resolvedMasterId =
        storedMaster?.resume_id ??
        pickLatest(masters.filter((r) => r.processing_status === 'ready'))?.resume_id ??
        pickLatest(masters)?.resume_id ??
        null;

      if (resolvedMasterId) {
        localStorage.setItem('master_resume_id', resolvedMasterId);
        setMasterResumeId(resolvedMasterId);
        // Use silent refresh inside loadTailoredResumes so polling
        // doesn’t briefly flash a loading spinner on the master card.
        silentCheckMasterStatus(resolvedMasterId);
      } else {
        localStorage.removeItem('master_resume_id');
        setMasterResumeId(null);
      }

      const filtered = data.filter((r) => !r.is_master);
      setTailoredResumes(filtered);

      // Only fetch job descriptions for resumes that are actually tailored
      // (identified by having a non-null parent_id). This avoids N+1 calls
      // for untailored resumes.
      const tailoredWithParent = filtered.filter((r) => r.parent_id);

      // Guard against concurrent invocations overwriting each other
      const requestId = ++loadRequestIdRef.current;

      // Fetch job description snippets for tailored resumes in parallel and attach to state
      // Use a small in-memory cache to avoid re-fetching the same snippet repeatedly.
      const jobSnippets: Record<string, string> = {};
      await Promise.all(
        tailoredWithParent.map(async (r) => {
          // Use cached snippet when available
          if (jobSnippetCacheRef.current[r.resume_id]) {
            jobSnippets[r.resume_id] = jobSnippetCacheRef.current[r.resume_id];
            return;
          }
          try {
            const jd = await fetchJobDescription(r.resume_id);
            const snippet = (jd?.content || '').slice(0, 80);
            jobSnippetCacheRef.current[r.resume_id] = snippet;
            jobSnippets[r.resume_id] = snippet;
          } catch {
            // ignore missing job descriptions and cache empty result
            jobSnippetCacheRef.current[r.resume_id] = '';
            jobSnippets[r.resume_id] = '';
          }
        })
      );

      // Only apply results if this invocation is the latest (prevents stale overwrite)
      if (requestId === loadRequestIdRef.current) {
        const updated = filtered.map((r) => ({ ...r, jobSnippet: jobSnippets[r.resume_id] || '' }));
        setTailoredResumes(updated);
        // Persist to sessionStorage so next render (back navigation) gets instant data.
        // Pass the current master processing status so transient states are not cached.
        writeResumeCache(
          { masterId: resolvedMasterId ?? null, tailored: updated, masters },
          masterProcessingStatusRef.current,
        );
      }
      setIsListLoading(false);
    } catch (err) {
      console.error('Failed to load tailored resumes:', err);
      setIsListLoading(false);
    }
  }, [checkResumeStatus, silentCheckMasterStatus]);

  useEffect(() => {
    loadTailoredResumes();
  }, [loadTailoredResumes]);

  // ---------------------------------------------------------------
  // Real-time status: SSE stream while any resume is transient.
  // Opens ONE EventSource connection per transient batch.
  // Closes automatically once all IDs reach a terminal state.
  // ---------------------------------------------------------------
  const masterIsTransient = TRANSIENT_STATES.has(processingStatus);
  const tailoredTransientIds = tailoredResumes
    .filter((r) => TRANSIENT_STATES.has(r.processing_status ?? ''))
    .map((r) => r.resume_id);
  const tailoredIsTransient = tailoredTransientIds.length > 0;
  const hasAnyTransient = masterIsTransient || tailoredIsTransient;

  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!hasAnyTransient) {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      return;
    }

    // Build the list of IDs to watch
    const watchIds: string[] = [];
    if (masterIsTransient && masterResumeId) watchIds.push(masterResumeId);
    tailoredTransientIds.forEach((id) => watchIds.push(id));

    if (watchIds.length === 0) return;

    const params = new URLSearchParams({ ids: watchIds.join(',') });
    const url = `${API_BASE}/resumes/status-stream?${params.toString()}`;

    // Close any existing connection before opening a new one
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    const es = new EventSource(url);
    sseRef.current = es;

    es.onmessage = (event) => {
      try {
        const rawUpdates = JSON.parse(event.data) as Record<string, unknown>;
        const updates: Record<string, ResumeProcessingStatus> = {};
        for (const [id, status] of Object.entries(rawUpdates)) {
          const parsedStatus = asResumeProcessingStatus(status);
          if (parsedStatus) {
            updates[id] = parsedStatus;
          }
        }

        // Update master status silently (no loading flash)
        if (masterResumeId && updates[masterResumeId]) {
          setProcessingStatus(updates[masterResumeId] as ProcessingStatus);
        }

        // Update tailored resume statuses in-place
        if (Object.keys(updates).some((id) => id !== masterResumeId)) {
          setTailoredResumes((prev) =>
            prev.map((r) =>
              updates[r.resume_id]
                ? { ...r, processing_status: updates[r.resume_id] }
                : r
            )
          );
        }
      } catch {
        // malformed event — ignore
      }
    };

    es.addEventListener('done', () => {
      es.close();
      sseRef.current = null;
      // Final full refresh to pick up completed data (title, snippets, etc.)
      loadTailoredResumes();
    });

    es.onerror = () => {
      // SSE error (network issue, token expired, etc.) — fall back to one manual refresh
      es.close();
      sseRef.current = null;
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
    // Intentionally track only stable primitives to avoid reconnect on every render.
    // The `hasAnyTransient` boolean is the correct gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAnyTransient, masterResumeId, tailoredTransientIds.join(',')]);

  // Refresh list when window gains focus (e.g., returning from viewer after delete)
  useEffect(() => {
    const handleFocus = () => {
      loadTailoredResumes();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadTailoredResumes, checkResumeStatus]);

  const handleUploadComplete = (resumeId: string) => {
    localStorage.setItem('master_resume_id', resumeId);
    setMasterResumeId(resumeId);
    // Check status after upload completes
    checkResumeStatus(resumeId);
    loadTailoredResumes();
    // Update cached counters
    incrementResumes();
    setHasMasterResume(true);
  };

  const handleSelectMaster = (resumeId: string) => {
    localStorage.setItem('master_resume_id', resumeId);
    setMasterResumeId(resumeId);
    checkResumeStatus(resumeId);
  };

  const handleRetryProcessing = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!masterResumeId) return;
    setIsRetrying(true);
    try {
      const result = await retryProcessing(masterResumeId);
      if (result.processing_status === 'ready') {
        setProcessingStatus('ready');
      } else if (
        result.processing_status === 'processing' ||
        result.processing_status === 'pending'
      ) {
        setProcessingStatus(result.processing_status);
      } else {
        setProcessingStatus('failed');
      }
    } catch (err) {
      console.error('Retry processing failed:', err);
      setProcessingStatus('failed');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDeleteAndReupload = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const confirmDeleteAndReupload = async () => {
    if (!masterResumeId || isDeletingMaster) return;
    setIsDeletingMaster(true);
    try {
      await deleteResume(masterResumeId);
      decrementResumes();
      setHasMasterResume(false);
      localStorage.removeItem('master_resume_id');
      // Invalidate sessionStorage cache so stale data isn’t shown after delete
      try { sessionStorage.removeItem(RESUME_LIST_CACHE_KEY); } catch {};
      setMasterResumeId(null);
      setProcessingStatus('loading');
      setIsUploadDialogOpen(true);
      setShowDeleteDialog(false);
      await loadTailoredResumes();
    } catch (err) {
      console.error('Failed to delete resume:', err);
    } finally {
      setIsDeletingMaster(false);
    }
  };

  const getStatusDisplay = () => {
    switch (processingStatus) {
      case 'loading':
        return {
          text: t('dashboard.status.checking'),
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          color: 'text-gray-500',
        };
      case 'processing':
        return {
          text: t('dashboard.status.processing'),
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          color: 'text-blue-700',
        };
      case 'ready':
        return { text: t('dashboard.status.ready'), icon: null, color: 'text-green-700' };
      case 'failed':
        return {
          text: t('dashboard.status.failed'),
          icon: <AlertCircle className="w-3 h-3" />,
          color: 'text-red-600',
        };
      default:
        return { text: t('dashboard.status.pending'), icon: null, color: 'text-gray-500' };
    }
  };

  const getMonogram = (title: string): string => {
    const words = title.split(/\s+/).filter((w) => /^[a-zA-Z]/.test(w));
    return words
      .slice(0, 3)
      .map((w) => w.charAt(0).toUpperCase())
      .join('');
  };

  // Muted palette that complements the #F0F0E8 canvas
  const cardPalette = [
    { bg: '#1D4ED8', fg: '#FFFFFF' }, // Hyper Blue
    { bg: '#15803D', fg: '#FFFFFF' }, // Signal Green
    { bg: '#000000', fg: '#FFFFFF' }, // Ink
    { bg: '#92400E', fg: '#FFFFFF' }, // Warm Brown
    { bg: '#7C3AED', fg: '#FFFFFF' }, // Violet
    { bg: '#0E7490', fg: '#FFFFFF' }, // Teal
    { bg: '#B91C1C', fg: '#FFFFFF' }, // Deep Red
    { bg: '#4338CA', fg: '#FFFFFF' }, // Indigo
  ];

  const hashTitle = (title: string): number => {
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = (hash << 5) - hash + title.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  };

  const masterCardCount = masterResumes.length > 0 ? masterResumes.length + 1 : 1;
  const totalCards = masterCardCount + tailoredResumes.length + 1;
  const fillerCount = Math.max(0, (5 - (totalCards % 5)) % 5);
  const extraFillerCount = 5;
  // Use Tailwind classes for fillers now that we have them in config or use specific hex if needed
  // Using the hex values from before to maintain exact look, or we could map them to variants
  const fillerPalette = ['bg-[#E5E5E0]', 'bg-[#D8D8D2]', 'bg-[#CFCFC7]', 'bg-[#E0E0D8]'];

  return (
    <div className="space-y-6">
      {/* Configuration Warning Banner */}
      {masterResumeId && !isLlmConfigured && !statusLoading && (
        <div className="border-2 border-warning bg-amber-50 p-4 shadow-sw-default mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
            <div>
              <p className="font-mono text-sm font-bold uppercase tracking-wider text-amber-800">
                {t('dashboard.llmNotConfiguredTitle')}
              </p>
              <p className="font-mono text-xs text-amber-700 mt-0.5">
                {t('dashboard.llmNotConfiguredMessage')}
              </p>
            </div>
          </div>
          <Link href="/settings" className="self-start sm:self-auto">
            <Button variant="outline" size="sm" className="border-warning text-amber-700 w-full sm:w-auto">
              <Settings className="w-4 h-4 mr-2" />
              {t('nav.settings')}
            </Button>
          </Link>
        </div>
      )}

      <SwissGrid>
        {/* 1. Master Resume Logic */}
        {masterResumes.length === 0 ? (
          // LLM Not Configured or Upload State
          !isLlmConfigured && !statusLoading ? (
            <Link href="/settings" className="block h-full">
              <Card
                variant="interactive"
                className="aspect-square h-full border-dashed border-warning bg-amber-50"
              >
                <div className="flex-1 flex flex-col justify-between">
                  <div className="w-14 h-14 border-2 border-warning bg-white flex items-center justify-center mb-4">
                    <AlertTriangle className="w-7 h-7 text-warning" />
                  </div>
                  <div>
                    <CardTitle className="text-lg uppercase text-amber-800 mb-2">
                      {t('dashboard.setupRequiredTitle')}
                    </CardTitle>
                    <CardDescription className="text-amber-700 text-xs">
                      {t('dashboard.setupRequiredMessage')}
                    </CardDescription>
                    <div className="flex items-center gap-2 mt-4 text-amber-700 group-hover:text-amber-900">
                      <Settings className="w-4 h-4" />
                      <span className="font-mono text-xs font-bold uppercase">
                        {t('nav.goToSettings')}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ) : (
            <ResumeUploadDialog
              open={isUploadDialogOpen}
              onOpenChange={setIsUploadDialogOpen}
              onUploadComplete={handleUploadComplete}
              trigger={
                <Card
                  variant="interactive"
                  className="aspect-square h-full hover:bg-primary hover:text-canvas"
                >
                  <div className="flex-1 flex flex-col justify-between pointer-events-none">
                    <div className="w-14 h-14 border-2 border-current flex items-center justify-center mb-4">
                      <span className="text-2xl leading-none relative top-[-2px]">+</span>
                    </div>
                    <div>
                      <CardTitle className="text-xl uppercase">
                        {t('dashboard.initializeMasterResume')}
                      </CardTitle>
                      <CardDescription className="mt-2 opacity-60 group-hover:opacity-100 text-current">
                        {'// '}
                        {t('dashboard.initializeSequence')}
                      </CardDescription>
                    </div>
                  </div>
                </Card>
              }
            />
          )
        ) : (
          // Master Resume Exists
          <>
            {masterResumes.map((master) => {
              const isActiveMaster = master.resume_id === masterResumeId;
              const masterTitle = master.title || master.filename || t('dashboard.masterResume');
              return (
                <Card
                  key={master.resume_id}
                  variant="interactive"
                  className={`aspect-square h-full ${isActiveMaster ? 'border-black' : ''}`}
                  onClick={() => {
                    if (!isActiveMaster) {
                      handleSelectMaster(master.resume_id);
                    }
                    navigateTo(master.resume_id, `/resumes/${master.resume_id}`);
                  }}
                >
                  <div className="flex-1 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-16 h-16 border-2 border-black bg-blue-700 text-white flex items-center justify-center">
                        <span className="font-mono font-bold text-lg">M</span>
                      </div>
                      <div className="flex gap-1 items-center">
                        {navigatingTo === master.resume_id && (
                          <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
                        )}
                        <span className="font-mono text-xs text-gray-500 uppercase">
                          {t('dashboard.masterResume')}
                        </span>
                        {isActiveMaster && processingStatus === 'failed' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-blue-100 hover:text-blue-700 z-10 rounded-none relative"
                            onClick={handleRetryProcessing}
                            disabled={isRetrying}
                            title={t('dashboard.retryProcessing')}
                          >
                            {isRetrying ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    <CardTitle className="text-lg group-hover:text-primary">
                      <span className="block font-serif text-base font-bold leading-tight normal-case line-clamp-2">
                        {masterTitle}
                      </span>
                    </CardTitle>

                    <div
                      className={`text-xs font-mono mt-auto pt-4 flex flex-col gap-2 uppercase ${isActiveMaster ? getStatusDisplay().color : 'text-gray-500'}`}
                    >
                      <div className="flex items-center gap-1">
                        {isActiveMaster ? getStatusDisplay().icon : null}
                        {isActiveMaster
                          ? t('dashboard.statusLine', { status: getStatusDisplay().text })
                          : t('dashboard.edited', {
                              date: formatDate(master.updated_at || master.created_at),
                            })}
                      </div>
                      {isActiveMaster && processingStatus === 'failed' && (
                        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 rounded-none border-black w-full"
                            onClick={handleRetryProcessing}
                            disabled={isRetrying}
                          >
                            {isRetrying
                              ? t('dashboard.retryingProcessing')
                              : t('dashboard.retryProcessing')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 rounded-none border-red-600 text-red-600 hover:bg-red-50 w-full"
                            onClick={handleDeleteAndReupload}
                          >
                            {t('dashboard.deleteAndReupload')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}

            <ResumeUploadDialog
              asMaster
              onUploadComplete={handleUploadComplete}
              trigger={
                <Card variant="interactive" className="aspect-square h-full hover:bg-primary hover:text-canvas">
                  <div className="flex-1 flex flex-col justify-between pointer-events-none">
                    <div className="w-14 h-14 border-2 border-current flex items-center justify-center mb-4">
                      <span className="text-2xl leading-none relative top-[-2px]">+</span>
                    </div>
                    <div>
                      <CardTitle className="text-lg uppercase">
                        {t('dashboard.addAnotherMasterResume')}
                      </CardTitle>
                      <CardDescription className="mt-2 opacity-60 group-hover:opacity-100 text-current">
                        {'// '}
                        {t('dashboard.uploadResume')}
                      </CardDescription>
                    </div>
                  </div>
                </Card>
              }
            />
          </>
        )}

        {/* 2. Tailored Resumes - show skeletons on first-ever load when cache is empty */}
        {isListLoading && tailoredResumes.length === 0 ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Card
              key={`skeleton-${i}`}
              variant="default"
              className="aspect-square h-full bg-canvas animate-pulse"
            >
              <div className="flex-1 flex flex-col">
                <div className="w-12 h-12 bg-gray-300 mb-6" />
                <div className="h-3 bg-gray-200 w-3/4 mb-2 rounded-none" />
                <div className="h-3 bg-gray-200 w-1/2 rounded-none" />
              </div>
            </Card>
          ))
        ) : (
          tailoredResumes.map((resume) => {
          const title =
            resume.title || resume.jobSnippet || resume.filename || t('dashboard.tailoredResume');
          const color = cardPalette[hashTitle(title) % cardPalette.length];
          return (
            <Card
              key={resume.resume_id}
              variant="interactive"
              className="aspect-square h-full bg-canvas"
              onClick={() => navigateTo(resume.resume_id, `/resumes/${resume.resume_id}`)}
            >
              <div className="flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-6">
                  <div
                    className="w-12 h-12 border-2 border-black flex items-center justify-center"
                    style={{ backgroundColor: color.bg, color: color.fg }}
                  >
                    <span className="font-mono font-bold">{getMonogram(title)}</span>
                  </div>
                  {navigatingTo === resume.resume_id ? (
                    <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
                  ) : (
                    <span className="font-mono text-xs text-gray-500 uppercase">
                      {resume.processing_status}
                    </span>
                  )}
                </div>
                <CardTitle className="text-lg">
                  <span className="block font-serif text-base font-bold leading-tight mb-1 w-full line-clamp-2">
                    {title}
                  </span>
                </CardTitle>
                <CardDescription className="mt-auto pt-4 uppercase">
                  {t('dashboard.edited', {
                    date: formatDate(resume.updated_at || resume.created_at),
                  })}{' '}
                </CardDescription>
              </div>
            </Card>
          );
          })
        )}
        <Card className="aspect-square h-full" variant="default">
          <div className="flex-1 flex flex-col items-center justify-center text-center h-full">
            <Button
              onClick={() => navigateTo('tailor', '/tailor')}
              disabled={!isTailorEnabled || navigatingTo === 'tailor'}
              className="w-20 h-20 bg-blue-700 text-white border-2 border-black shadow-sw-default hover:bg-blue-800 hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all rounded-none"
            >
              {navigatingTo === 'tailor' ? <Loader2 className="w-8 h-8 animate-spin" /> : <Plus className="w-8 h-8" />}
            </Button>
            <p className="text-xs font-mono mt-4 uppercase text-green-700">
              {t('dashboard.createResume')}
            </p>
          </div>
        </Card>

        {/* 4. Fillers */}
        {Array.from({ length: fillerCount }).map((_, index) => (
          <Card
            key={`filler-${index}`}
            variant="ghost"
            noPadding
            className="hidden md:block bg-canvas aspect-square h-full opacity-50 pointer-events-none"
          />
        ))}

        {Array.from({ length: extraFillerCount }).map((_, index) => (
          <Card
            key={`extra-filler-${index}`}
            variant="ghost"
            noPadding
            className={`hidden md:block ${fillerPalette[index % fillerPalette.length]} aspect-square h-full opacity-70 pointer-events-none`}
          />
        ))}

        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          title={t('confirmations.deleteMasterResumeTitle')}
          description={t('confirmations.deleteMasterResumeDescription')}
          confirmLabel={t('dashboard.deleteAndReupload')}
          cancelLabel={t('confirmations.keepResumeCancelLabel')}
          confirmLoading={isDeletingMaster}
          confirmDisabled={isDeletingMaster}
          onConfirm={confirmDeleteAndReupload}
          variant="danger"
          closeOnConfirm={false}
        />
      </SwissGrid>
    </div>
  );
}
