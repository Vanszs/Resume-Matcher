'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, X, ChevronDown, ChevronRight, Loader2, Briefcase, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslations } from '@/lib/i18n';
import type {
  ResumeDiffSummary,
  ResumeFieldDiff,
  RemovedEntry,
} from '@/components/common/resume_previewer_context';

interface DiffPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReject: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
  diffSummary?: ResumeDiffSummary;
  detailedChanges?: ResumeFieldDiff[];
  removedEntries?: RemovedEntry[];
  promptId?: string;
  errorMessage?: string;
}

export function DiffPreviewModal({
  isOpen,
  onClose,
  onReject,
  onConfirm,
  isSubmitting = false,
  diffSummary,
  detailedChanges,
  removedEntries,
  promptId,
  errorMessage,
}: DiffPreviewModalProps) {
  const { t } = useTranslations();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['removed', 'summary', 'skills', 'descriptions', 'experience'])
  );

  if (!diffSummary || !detailedChanges) {
    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            onClose();
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-6 bg-[#F0F0E8] border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
          <DialogHeader className="border-b-2 border-black pb-4 bg-white -mx-6 -mt-6 px-6 pt-6">
            <DialogTitle className="font-serif text-2xl font-bold uppercase tracking-tight">
              {t('tailor.missingDiffDialog.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-6 border-2 border-black bg-white p-4 font-mono text-xs text-gray-700">
            {t('tailor.missingDiffDialog.description')}
          </div>
          <div className="mt-3 flex items-center gap-2 font-mono text-xs text-amber-700">
            <AlertTriangle className="w-4 h-4" />
            <span>{t('tailor.missingDiffDialog.confirmLabel')}</span>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-stretch sm:items-center gap-3 pt-4 border-t-2 border-black bg-white -mx-6 -mb-6 px-6 py-4">
            <Button variant="outline" onClick={onClose} className="gap-2 w-full sm:w-auto" disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button variant="warning" onClick={onConfirm} className="gap-2 w-full sm:w-auto" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.processing')}
                </>
              ) : (
                t('tailor.missingDiffDialog.confirmLabel')
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // Group changes by type (exclude removed_entry — handled in separate panel)
  const summaryChanges = detailedChanges.filter((c) => c.field_type === 'summary');
  const skillChanges = detailedChanges.filter((c) => c.field_type === 'skill');
  const descChanges = detailedChanges.filter((c) => c.field_type === 'description');
  const certChanges = detailedChanges.filter((c) => c.field_type === 'certification');
  const experienceChanges = detailedChanges.filter((c) => c.field_type === 'experience');
  const educationChanges = detailedChanges.filter((c) => c.field_type === 'education');
  const projectChanges = detailedChanges.filter((c) => c.field_type === 'project');

  const isFocused = promptId === 'focused';
  const removedCount = removedEntries?.length ?? 0;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-6 bg-[#F0F0E8] border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
        <DialogHeader className="border-b-2 border-black pb-4 bg-white -mx-6 -mt-6 px-6 pt-6">
          <DialogTitle className="font-serif text-2xl font-bold uppercase tracking-tight">
            {t('tailor.diffModal.title')}
          </DialogTitle>
          <p className="font-mono text-xs text-gray-600 mt-2">
            {'// '}
            {t('tailor.diffModal.subtitle')}
          </p>
        </DialogHeader>

        {/* Removed Entries panel (focused mode only) */}
        {isFocused && (
          <div className="border-2 border-amber-500 bg-white mt-4">
            <button
              onClick={() => toggleSection('removed')}
              className="w-full flex items-center justify-between p-3 hover:bg-amber-50"
            >
              <div className="flex items-center gap-2">
                {expandedSections.has('removed') ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span className="font-mono text-sm font-bold uppercase tracking-wider text-amber-800">
                  {t('tailor.diffModal.removedEntriesTitle')}
                </span>
                <span className="ml-1 bg-amber-500 text-white font-mono text-xs px-1.5 py-0.5 font-bold">
                  {removedCount}
                </span>
              </div>
            </button>

            {expandedSections.has('removed') && (
              <div className="border-t-2 border-amber-500 p-4 space-y-3">
                {removedCount === 0 ? (
                  <div className="flex items-center gap-2 text-[#15803D] font-mono text-xs">
                    <CheckCircle className="w-4 h-4" />
                    <span>{t('tailor.diffModal.allRelevant')}</span>
                  </div>
                ) : (
                  (removedEntries ?? []).map((entry, idx) => (
                    <div key={idx} className="border-l-4 border-amber-500 bg-amber-50 p-3">
                      <div className="flex items-start gap-2">
                        {entry.type === 'workExperience' ? (
                          <Briefcase className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        ) : (
                          <FolderOpen className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <div className="font-mono text-sm font-bold text-amber-900">
                            {entry.label}
                          </div>
                          {entry.reason && (
                            <div className="font-mono text-xs text-amber-700 mt-0.5">
                              <span className="font-bold uppercase">{t('tailor.diffModal.removedReason')}:</span>{' '}
                              {entry.reason}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Summary cards */}
        <div className="border-2 border-black bg-white p-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 bg-[#1D4ED8]"></div>
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider">
              {t('tailor.diffModal.summary')}
            </h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard
              label={t('tailor.diffModal.skillsAdded')}
              value={diffSummary.skills_added}
              variant="success"
            />
            <StatCard
              label={t('tailor.diffModal.skillsRemoved')}
              value={diffSummary.skills_removed}
              variant="warning"
            />
            <StatCard
              label={t('tailor.diffModal.certificationsAdded')}
              value={diffSummary.certifications_added}
              variant="info"
            />
            <StatCard
              label={t('tailor.diffModal.descriptionsModified')}
              value={diffSummary.descriptions_modified}
              variant="info"
            />
            <StatCard
              label={t('tailor.diffModal.highRiskChanges')}
              value={diffSummary.high_risk_changes}
              variant={diffSummary.high_risk_changes > 0 ? 'danger' : 'success'}
            />
            {isFocused && (
              <StatCard
                label={t('tailor.diffModal.entriesRemoved')}
                value={diffSummary.entries_removed ?? removedCount}
                variant={removedCount > 0 ? 'warning' : 'success'}
              />
            )}
          </div>

          {diffSummary.high_risk_changes > 0 && (
            <div className="mt-4 border-2 border-[#F97316] bg-[#FFF7ED] p-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#F97316] shrink-0 mt-0.5" />
              <div>
                <p className="font-mono text-xs font-bold uppercase text-[#C2410C]">
                  {t('tailor.diffModal.warningTitle', {
                    count: diffSummary.high_risk_changes,
                  })}
                </p>
                <p className="font-mono text-xs text-[#C2410C] mt-1">
                  {t('tailor.diffModal.warningMessage')}
                </p>
              </div>
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="mt-4 border-2 border-red-600 bg-red-50 p-3 font-mono text-xs text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Detailed changes list */}
        <div className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-4">
          {/* Summary changes */}
          {summaryChanges.length > 0 && (
            <ChangeSection
              title={t('tailor.diffModal.summaryChanges')}
              count={summaryChanges.length}
              isExpanded={expandedSections.has('summary')}
              onToggle={() => toggleSection('summary')}
            >
              {summaryChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
            </ChangeSection>
          )}

          {/* Skill changes */}
          {skillChanges.length > 0 && (
            <ChangeSection
              title={t('tailor.diffModal.skillChanges')}
              count={skillChanges.length}
              isExpanded={expandedSections.has('skills')}
              onToggle={() => toggleSection('skills')}
            >
              {skillChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
            </ChangeSection>
          )}

          {/* Experience changes */}
          {experienceChanges.length > 0 && (
            <ChangeSection
              title={t('tailor.diffModal.experienceChanges')}
              count={experienceChanges.length}
              isExpanded={expandedSections.has('experience')}
              onToggle={() => toggleSection('experience')}
            >
              {experienceChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
            </ChangeSection>
          )}

          {/* Description changes */}
          {descChanges.length > 0 && (
            <ChangeSection
              title={t('tailor.diffModal.descriptionChanges')}
              count={descChanges.length}
              isExpanded={expandedSections.has('descriptions')}
              onToggle={() => toggleSection('descriptions')}
            >
              {descChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
            </ChangeSection>
          )}

          {/* Education changes */}
          {educationChanges.length > 0 && (
            <ChangeSection
              title={t('tailor.diffModal.educationChanges')}
              count={educationChanges.length}
              isExpanded={expandedSections.has('education')}
              onToggle={() => toggleSection('education')}
            >
              {educationChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
            </ChangeSection>
          )}

          {/* Project changes */}
          {projectChanges.length > 0 && (
            <ChangeSection
              title={t('tailor.diffModal.projectChanges')}
              count={projectChanges.length}
              isExpanded={expandedSections.has('project')}
              onToggle={() => toggleSection('project')}
            >
              {projectChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
            </ChangeSection>
          )}

          {/* Certification changes */}
          {certChanges.length > 0 && (
            <ChangeSection
              title={t('tailor.diffModal.certificationChanges')}
              count={certChanges.length}
              isExpanded={expandedSections.has('certifications')}
              onToggle={() => toggleSection('certifications')}
            >
              {certChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
            </ChangeSection>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row sm:justify-between items-stretch sm:items-center gap-3 pt-4 border-t-2 border-black bg-white -mx-6 -mb-6 px-6 py-4">
          <Button variant="outline" onClick={onReject} className="gap-2 w-full sm:w-auto order-2 sm:order-1" disabled={isSubmitting}>
            <X className="w-4 h-4" />
            {t('tailor.diffModal.rejectButton')}
          </Button>
          <Button
            onClick={onConfirm}
            className="gap-2 bg-[#15803D] hover:bg-[#166534] w-full sm:w-auto order-1 sm:order-2"
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {isSubmitting ? t('common.processing') : t('tailor.diffModal.confirmButton')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper component: stat card
interface StatCardProps {
  label: string;
  value: number;
  variant: 'success' | 'warning' | 'danger' | 'info';
}

function StatCard({ label, value, variant }: StatCardProps) {
  const colors = {
    success: 'border-[#15803D] bg-[#F0FDF4] text-[#15803D]',
    warning: 'border-[#F97316] bg-[#FFF7ED] text-[#F97316]',
    danger: 'border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]',
    info: 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]',
  };

  return (
    <div className={`border-2 p-3 ${colors[variant]}`}>
      <div className="font-mono text-2xl font-bold">{value}</div>
      <div className="font-mono text-xs uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

// Helper component: collapsible change section
interface ChangeSectionProps {
  title: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function ChangeSection({ title, count, isExpanded, onToggle, children }: ChangeSectionProps) {
  return (
    <div className="border-2 border-black bg-white">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="font-mono text-sm font-bold uppercase tracking-wider">
            {title} ({count})
          </span>
        </div>
      </button>

      {isExpanded && <div className="border-t-2 border-black p-4 space-y-3">{children}</div>}
    </div>
  );
}

// Helper component: change item
interface ChangeItemProps {
  change: ResumeFieldDiff;
}

function ChangeItem({ change }: ChangeItemProps) {
  const typeColors = {
    added: 'border-l-4 border-[#15803D] bg-[#F0FDF4]',
    removed: 'border-l-4 border-[#DC2626] bg-[#FEF2F2]',
    modified: 'border-l-4 border-[#1D4ED8] bg-[#EFF6FF]',
  };

  const typeLabels = {
    added: '+',
    removed: '-',
    modified: '~',
  };

  return (
    <div className={`p-3 ${typeColors[change.change_type]}`}>
      <div className="flex items-start gap-2">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500">
          {typeLabels[change.change_type]}
        </span>
        <div className="flex-1">
          {change.original_value && (
            <div className="line-through text-[#DC2626] font-mono text-sm mb-1">
              {change.original_value}
            </div>
          )}
          {change.new_value && (
            <div className="text-gray-900 font-mono text-sm">{change.new_value}</div>
          )}
        </div>
        {change.change_type === 'added' && change.confidence === 'high' && (
          <AlertTriangle className="w-4 h-4 text-[#F97316] shrink-0" />
        )}
      </div>
    </div>
  );
}
