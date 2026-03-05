'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  UploadIcon,
  Loader2Icon,
  AlertCircleIcon,
  FileIcon,
  XIcon,
  CheckCircle2Icon,
} from 'lucide-react';
import { useFileUpload, formatBytes } from '@/hooks/use-file-upload';
import { getUploadUrl } from '@/lib/api/client';
import { useTranslations } from '@/lib/i18n';
import { retryProcessing, fetchResume, deleteResume } from '@/lib/api/resume';

interface ResumeUploadDialogProps {
  trigger?: React.ReactNode;
  onUploadComplete?: (resumeId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  asMaster?: boolean;
}

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
];
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

export function ResumeUploadDialog({
  trigger,
  onUploadComplete,
  open: controlledOpen,
  onOpenChange,
  asMaster = false,
}: ResumeUploadDialogProps) {
  const { t } = useTranslations();
  const [internalOpen, setInternalOpen] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [failedResumeId, setFailedResumeId] = useState<string | null>(null);
  const [isRetryingProcessing, setIsRetryingProcessing] = useState(false);
  // Raw error message from LLM/backend, shown behind a toggle for UX.
  const [rawErrorDetail, setRawErrorDetail] = useState<string | null>(null);
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  // Tracks a resume whose AI parsing is still running in the background.
  // While set, the dialog stays open showing a processing indicator.
  const [pendingResumeId, setPendingResumeId] = useState<string | null>(null);
  const [isAwaitingProcessing, setIsAwaitingProcessing] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref copy so stale closures inside hook callbacks can always read current value.
  const pendingResumeIdRef = useRef<string | null>(null);
  useEffect(() => {
    pendingResumeIdRef.current = pendingResumeId;
  }, [pendingResumeId]);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  // Stop polling and optionally delete the pending record (when user cancels).
  const stopPolling = (deleteId?: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (deleteId) {
      deleteResume(deleteId).catch(() => {});
    }
    setPendingResumeId(null);
    setIsAwaitingProcessing(false);
  };

  // Cleanup polling when component unmounts.
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  const UPLOAD_URL = getUploadUrl(asMaster);

  const handleUploadSuccess = ({
    resumeId,
    fileId,
    message,
  }: {
    resumeId: string;
    fileId?: string;
    message: string;
  }) => {
    setUploadFeedback({ type: 'success', message });
    setFailedResumeId(null);

    // Defer parent state update to avoid setState during render
    setTimeout(() => {
      onUploadComplete?.(resumeId);
    }, 0);

    // Close dialog after a short delay to show success state
    setTimeout(() => {
      setIsOpen(false);
      setUploadFeedback(null);
      setFailedResumeId(null);
      if (fileId) {
        removeFile(fileId); // Clear file for next time
      }
    }, 1500);
  };

  const [
    { files, isDragging, errors, isUploadingGlobal },
    {
      getInputProps,
      openFileDialog,
      removeFile,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
    },
  ] = useFileUpload({
    maxSize: MAX_FILE_SIZE,
    accept: ACCEPTED_FILE_TYPES.join(','),
    multiple: false,
    uploadUrl: UPLOAD_URL,
    onUploadSuccess: (uploadedFile, response) => {
      const data = response as {
        resume_id?: string;
        processing_status?: 'pending' | 'processing' | 'ready' | 'failed';
        is_master?: boolean;
        error_message?: string | null;
      };
      if (data.resume_id) {
        const processingFailed = data.processing_status === 'failed';
        const successMessage = data.is_master
          ? t('dashboard.uploadDialog.successMaster')
          : t('dashboard.uploadDialog.success');
        if (processingFailed) {
          // Keep dialog open on failure so users can retry processing.
          setUploadFeedback({
            type: 'error',
            message: t('dashboard.uploadDialog.parsingFailedKeepOpen'),
          });
          setRawErrorDetail(data.error_message ?? null);
          setShowErrorDetail(false);
          setFailedResumeId(data.resume_id);
          return;
        }
        // Backend returns 'processing' immediately (async background parsing).
        // Keep dialog open and poll until AI finishes.
        if (data.processing_status === 'processing') {
          setPendingResumeId(data.resume_id);
          setIsAwaitingProcessing(true);
          setUploadFeedback({
            type: 'success',
            message: t('dashboard.uploadDialog.aiProcessing'),
          });
          const pending_id = data.resume_id;
          const file_id = uploadedFile.id;
          pollingRef.current = setInterval(async () => {
            try {
              const res = await fetchResume(pending_id);
              const newStatus = res.raw_resume?.processing_status;
              if (newStatus === 'ready') {
                clearInterval(pollingRef.current!);
                pollingRef.current = null;
                setPendingResumeId(null);
                setIsAwaitingProcessing(false);
                handleUploadSuccess({
                  resumeId: pending_id,
                  fileId: file_id,
                  message: successMessage,
                });
              } else if (newStatus === 'failed') {
                clearInterval(pollingRef.current!);
                pollingRef.current = null;
                setIsAwaitingProcessing(false);
                setUploadFeedback({
                  type: 'error',
                  message: t('dashboard.uploadDialog.parsingFailedKeepOpen'),
                });
                setRawErrorDetail(res.raw_resume?.error_message ?? null);
                setShowErrorDetail(false);
                setFailedResumeId(pending_id);
                setPendingResumeId(null);
              }
            } catch {
              // ignore transient poll errors
            }
          }, 3000);
          return;
        }
        handleUploadSuccess({
          resumeId: data.resume_id,
          fileId: uploadedFile.id,
          message: successMessage,
        });
      } else {
        setFailedResumeId(null);
        setUploadFeedback({
          type: 'error',
          message: t('dashboard.uploadDialog.successMissingId'),
        });
      }
    },
    onUploadError: (file, errorMsg) => {
      setFailedResumeId(null);
      setUploadFeedback({
        type: 'error',
        message: errorMsg || t('dashboard.uploadDialog.failed'),
      });
    },
    onFilesChange: (currentFiles) => {
      if (currentFiles.length === 0) {
        setUploadFeedback(null);
        setFailedResumeId(null);
        // If user removes the file while processing is pending, delete the orphaned record.
        stopPolling(pendingResumeIdRef.current ?? undefined);
      }
    },
  });

  const currentFile = files[0];
  const displayErrors = uploadFeedback?.type === 'error' ? [uploadFeedback.message] : errors;
  const preventDropzoneInteraction = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleRetryProcessing = async () => {
    if (!failedResumeId) return;
    const resumeIdToRetry = failedResumeId;
    const fileIdToRemove = currentFile?.id;
    setIsRetryingProcessing(true);
    try {
      const result = await retryProcessing(resumeIdToRetry);
      if (result.processing_status !== 'ready') {
        setUploadFeedback({ type: 'error', message: t('dashboard.retryFailed') });
        setRawErrorDetail(result.error_message ?? null);
        setShowErrorDetail(false);
        return;
      }

      handleUploadSuccess({
        resumeId: resumeIdToRetry,
        fileId: fileIdToRemove,
        message: t('dashboard.retrySuccess'),
      });
    } catch (err) {
      console.error('Retry processing failed:', err);
      setUploadFeedback({ type: 'error', message: t('dashboard.retryFailed') });
    } finally {
      setIsRetryingProcessing(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        // If dialog is being closed while AI parsing is still in progress,
        // delete the orphaned backend record so dashboard stays clean.
        if (!nextOpen && pendingResumeIdRef.current) {
          stopPolling(pendingResumeIdRef.current);
        }
        setIsOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-none border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all">
            <UploadIcon className="w-4 h-4 mr-2" />
            {t('dashboard.uploadResume')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-[#F0F0E8] border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] p-0 gap-0 rounded-none">
        <DialogHeader className="p-6 border-b border-black bg-white">
          <DialogTitle className="font-serif text-2xl font-bold uppercase tracking-tight">
            {t('dashboard.uploadResume')}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 bg-[#F0F0E8]">
          <div
            className={`
                            relative border-2 border-dashed p-8 text-center transition-all duration-200
                            ${isDragging ? 'border-blue-700 bg-blue-50' : 'border-gray-400 hover:border-black hover:bg-white'}
                            ${currentFile ? 'bg-white border-solid border-black' : ''}
                            ${!currentFile && !isRetryingProcessing ? 'cursor-pointer' : 'cursor-default'}
                            ${isRetryingProcessing ? 'opacity-70' : ''}
                        `}
            onClick={!currentFile && !isRetryingProcessing ? openFileDialog : undefined}
            onDragEnter={(isRetryingProcessing || isAwaitingProcessing) ? preventDropzoneInteraction : handleDragEnter}
            onDragLeave={(isRetryingProcessing || isAwaitingProcessing) ? preventDropzoneInteraction : handleDragLeave}
            onDragOver={(isRetryingProcessing || isAwaitingProcessing) ? preventDropzoneInteraction : handleDragOver}
            onDrop={(isRetryingProcessing || isAwaitingProcessing) ? preventDropzoneInteraction : handleDrop}
          >
            <input {...getInputProps()} />

            {isUploadingGlobal ? (
              <div className="flex flex-col items-center py-4">
                <Loader2Icon className="w-10 h-10 animate-spin text-blue-700 mb-4" />
                <p className="font-mono text-sm font-bold uppercase text-blue-700">
                  {t('common.uploading')}
                </p>
              </div>
            ) : isAwaitingProcessing && currentFile ? (
              /* AI parsing in progress */
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-left overflow-hidden">
                  <div className="w-10 h-10 border border-black bg-blue-50 flex items-center justify-center shrink-0">
                    <Loader2Icon className="w-5 h-5 text-blue-700 animate-spin" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate max-w-[200px]">
                      {currentFile.file.name}
                    </p>
                    <p className="font-mono text-xs text-blue-600 uppercase">
                      {t('dashboard.uploadDialog.aiProcessing')}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(currentFile.id);
                  }}
                  className="hover:bg-red-100 text-red-600 rounded-none"
                  title={t('dashboard.uploadDialog.tryDifferentFile')}
                >
                  <XIcon className="w-5 h-5" />
                </Button>
              </div>
            ) : currentFile ? (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-left overflow-hidden">
                  <div className="w-10 h-10 border border-black bg-gray-100 flex items-center justify-center shrink-0">
                    <FileIcon className="w-5 h-5 text-black" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate max-w-[200px]">
                      {currentFile.file.name}
                    </p>
                    <p className="font-mono text-xs text-gray-500">
                      {formatBytes(currentFile.file.size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isRetryingProcessing}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(currentFile.id);
                  }}
                  className="hover:bg-red-100 text-red-600 rounded-none"
                >
                  <XIcon className="w-5 h-5" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4">
                <div className="w-12 h-12 border border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] flex items-center justify-center mb-4">
                  <UploadIcon className="w-6 h-6 text-black" />
                </div>
                <p className="font-bold text-lg mb-1">
                  {t('dashboard.uploadDialog.dropzoneTitle')}
                </p>
                <p className="font-mono text-xs text-gray-500 uppercase">
                  {t('dashboard.uploadDialog.dropzoneSubtitle')}
                </p>
              </div>
            )}
          </div>

          {/* Feedback Messages */}
          {displayErrors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">
              <div className="flex items-start gap-2">
                <AlertCircleIcon className="w-5 h-5 shrink-0" />
                <div className="flex-1">
                  {displayErrors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              </div>
              {rawErrorDetail && (
                <div className="mt-2">
                  <button
                    type="button"
                    className="font-mono text-xs uppercase underline underline-offset-2 hover:text-red-900 transition-colors"
                    onClick={() => setShowErrorDetail((v) => !v)}
                  >
                    {showErrorDetail
                      ? t('dashboard.uploadDialog.hideErrorDetail')
                      : t('dashboard.uploadDialog.showErrorDetail')}
                  </button>
                  {showErrorDetail && (
                    <pre className="mt-2 p-2 bg-red-100/50 border border-red-200 text-xs font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                      {rawErrorDetail}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {uploadFeedback?.type === 'success' && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 flex items-center gap-2 text-green-700 text-sm font-bold">
              <CheckCircle2Icon className="w-5 h-5 shrink-0" />
              <p>{uploadFeedback.message}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-black bg-white flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {uploadFeedback?.type === 'error' && failedResumeId && (
            <Button
              variant="outline"
              className="rounded-none border-black hover:bg-gray-100 w-full sm:w-auto"
              onClick={handleRetryProcessing}
              disabled={isRetryingProcessing}
            >
              {isRetryingProcessing
                ? t('dashboard.retryingProcessing')
                : t('dashboard.retryProcessing')}
            </Button>
          )}
          {uploadFeedback?.type === 'error' && files.length > 0 && (
            <Button
              variant="outline"
              className="rounded-none border-black hover:bg-gray-100 w-full sm:w-auto"
              disabled={isRetryingProcessing}
              onClick={() => {
                if (pendingResumeIdRef.current) stopPolling(pendingResumeIdRef.current);
                if (files[0]) removeFile(files[0].id);
                setUploadFeedback(null);
                setFailedResumeId(null);
                setRawErrorDetail(null);
                setShowErrorDetail(false);
              }}
            >
              {t('dashboard.uploadDialog.tryDifferentFile')}
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="outline" className="rounded-none border-black hover:bg-gray-100 w-full sm:w-auto">
              {t('common.cancel')}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
