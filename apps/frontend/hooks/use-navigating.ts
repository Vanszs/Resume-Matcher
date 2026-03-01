'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hook providing navigation with loading-state tracking and a safety timeout.
 *
 * `router.push()` in Next.js App Router is fire-and-forget — if the prefetch
 * or the target page fails (e.g. network error, server down), the component
 * never unmounts and any `isNavigating` flag stays `true` forever.
 *
 * This hook auto-resets the flag after `timeoutMs` (default 8 s) so the UI
 * never gets permanently stuck.
 *
 * Usage:
 *   const { isNavigating, navigateTo, navigateBack } = useNavigating();
 *   <Button disabled={isNavigating} onClick={() => navigateTo('/dashboard')}>
 *
 * For dashboard-style pages with multiple cards:
 *   const { navigatingTo, navigateTo } = useNavigating();
 *   <Card onClick={() => navigateTo(resume.id, `/resumes/${resume.id}`)}>
 *     {navigatingTo === resume.id && <Loader2 />}
 */

const DEFAULT_TIMEOUT_MS = 8_000;

export function useNavigating(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  const router = useRouter();
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimeout = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      setNavigatingTo(null);
      timerRef.current = null;
    }, timeoutMs);
  }, [clearTimer, timeoutMs]);

  /**
   * Navigate to a path.
   *
   * @param keyOrPath - When called with 1 arg, used as both the tracking key
   *   AND the router path. When called with 2 args, this is the tracking key
   *   (e.g. a resume ID) and the second arg is the path.
   * @param path - The actual router path (optional, defaults to keyOrPath).
   */
  const navigateTo = useCallback(
    (keyOrPath: string, path?: string) => {
      if (navigatingTo) return; // already navigating — prevent double-click
      const key = keyOrPath;
      const target = path ?? keyOrPath;
      setNavigatingTo(key);
      startTimeout();
      router.push(target);
    },
    [navigatingTo, router, startTimeout]
  );

  /** Navigate back (router.back()). */
  const navigateBack = useCallback(() => {
    if (navigatingTo) return;
    setNavigatingTo('__back__');
    startTimeout();
    router.back();
  }, [navigatingTo, router, startTimeout]);

  const isNavigating = navigatingTo !== null;

  return { isNavigating, navigatingTo, navigateTo, navigateBack } as const;
}
