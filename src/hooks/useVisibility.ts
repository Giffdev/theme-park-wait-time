'use client';

import { useEffect, useRef } from 'react';

/**
 * Low-level hook that fires a callback when the page becomes visible.
 * Handles the Page Visibility API + iOS Safari focus fallback + debounce.
 *
 * @param onVisible - Called when the page transitions to visible (after debounce)
 * @param options.debounceMs - Minimum ms the page must have been hidden before
 *   onVisible fires. Prevents hammering on rapid tab switching. Default: 5000.
 */
export function useVisibility(
  onVisible: () => void,
  options?: { debounceMs?: number }
): void {
  const debounceMs = options?.debounceMs ?? 5000;
  const hiddenAtRef = useRef<number | null>(null);
  const onVisibleRef = useRef(onVisible);

  // Keep callback ref fresh without re-subscribing listeners
  useEffect(() => {
    onVisibleRef.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    function handleHidden() {
      hiddenAtRef.current = Date.now();
    }

    function handleVisible() {
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;

      // Only fire if page was hidden long enough to pass debounce
      if (hiddenAt === null) return;
      const elapsed = Date.now() - hiddenAt;
      if (elapsed < debounceMs) return;

      onVisibleRef.current();
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        handleHidden();
      } else if (document.visibilityState === 'visible') {
        handleVisible();
      }
    }

    // iOS Safari doesn't always fire visibilitychange reliably —
    // use blur/focus as fallback
    function onFocus() {
      if (hiddenAtRef.current !== null) {
        handleVisible();
      }
    }

    function onBlur() {
      if (hiddenAtRef.current === null) {
        handleHidden();
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, [debounceMs]);
}
