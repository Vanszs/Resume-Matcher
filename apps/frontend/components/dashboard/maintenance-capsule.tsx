'use client';

import { useState, useCallback, useEffect } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import X from 'lucide-react/dist/esm/icons/x';

interface MaintenanceCapsuleProps {
  message: string;
}

/**
 * A compact amber capsule shown in the dashboard header when the admin has
 * enabled the maintenance notice.  Clicking it opens a read-only modal with
 * the full message text.
 *
 * Design: Swiss International Style — sharp corners, 1px black border, hard
 * shadow, monospace typography.
 */
export function MaintenanceCapsule({ message }: MaintenanceCapsuleProps) {
  const [popupOpen, setPopupOpen] = useState(false);

  const openPopup = () => setPopupOpen(true);
  const closePopup = useCallback(() => setPopupOpen(false), []);

  // Close on Escape key
  useEffect(() => {
    if (!popupOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePopup();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [popupOpen, closePopup]);

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Collapsed Capsule                                                    */}
      {/* ------------------------------------------------------------------ */}
      <button
        type="button"
        onClick={openPopup}
        aria-label="Open maintenance notice"
        className="flex flex-col items-start gap-1 border border-black bg-amber-50 px-3 py-2 shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-amber-800 whitespace-nowrap">
            Maintenance Notice
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase text-amber-700 underline">
          Click for Detail
        </span>
      </button>

      {/* ------------------------------------------------------------------ */}
      {/* Full-message Popup                                                   */}
      {/* ------------------------------------------------------------------ */}
      {popupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePopup();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="maintenance-dialog-title"
        >
          <div className="relative w-full max-w-[28rem] border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-black p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
                <h2
                  id="maintenance-dialog-title"
                  className="font-serif text-lg font-bold uppercase tracking-tight"
                >
                  Maintenance Notice
                </h2>
              </div>
              <button
                type="button"
                onClick={closePopup}
                aria-label="Close"
                className="border border-black bg-white p-1 shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <p className="font-mono text-sm text-black whitespace-pre-wrap break-words">
                {message}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
