'use client';

import { useCallback, useRef, useState } from 'react';
import { useVisibility } from './useVisibility';

export interface UseAutoRefreshOptions {
  /** Unique identifier for this data (used for debugging) */
  key: string;
  /** Milliseconds before data is considered stale */
  staleness: number;
  /** Async function to refresh data — should update component state internally */
  onRefresh: () => Promise<void>;
  /** Disable auto-refresh (e.g., while page is still loading) */
  enabled?: boolean;
}

export interface UseAutoRefreshReturn {
  /** True while a background (visibility-triggered) refresh is in progress */
  isBackgroundRefreshing: boolean;
  /** Epoch ms of last successful refresh, or null if never refreshed */
  lastRefreshedAt: number | null;
  /** Manually trigger a refresh (resets staleness timer) */
  forceRefresh: () => Promise<void>;
}

/**
 * Staleness-aware auto-refresh hook.
 *
 * When the page becomes visible after being hidden for >5s, checks if data
 * exceeds the staleness threshold. If stale, silently refreshes in the background
 * without spinners or error toasts.
 */
export function useAutoRefresh(options: UseAutoRefreshOptions): UseAutoRefreshReturn {
  const { key, staleness, onRefresh, enabled = true } = options;

  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  const inFlightRef = useRef(false);
  const lastRefreshedAtRef = useRef<number | null>(null);

  const doRefresh = useCallback(
    async (background: boolean) => {
      // Respect in-flight — never double-fire
      if (inFlightRef.current) return;
      if (!enabled) return;

      inFlightRef.current = true;
      if (background) setIsBackgroundRefreshing(true);

      try {
        await onRefresh();
        const now = Date.now();
        lastRefreshedAtRef.current = now;
        setLastRefreshedAt(now);
      } catch (error) {
        // Background refresh errors are silent — log only
        console.error(`[useAutoRefresh:${key}] refresh failed:`, error);
      } finally {
        inFlightRef.current = false;
        if (background) setIsBackgroundRefreshing(false);
      }
    },
    [key, onRefresh, enabled]
  );

  // On visibility return: check staleness, refresh if needed
  useVisibility(
    useCallback(() => {
      if (!enabled) return;

      const last = lastRefreshedAtRef.current;
      const age = last === null ? Infinity : Date.now() - last;

      if (age >= staleness) {
        doRefresh(true);
      }
    }, [enabled, staleness, doRefresh]),
    { debounceMs: 5000 }
  );

  const forceRefresh = useCallback(async () => {
    await doRefresh(false);
  }, [doRefresh]);

  return { isBackgroundRefreshing, lastRefreshedAt, forceRefresh };
}
