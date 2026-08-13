'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  /**
   * Age (in ms) of the cached data that is already rendered on arrival, e.g.
   * `Date.now() - lastFetchedAt` for the snapshot the page is showing.
   *
   * - `undefined` (default): mount-arrival staleness check is skipped entirely —
   *   only the hidden→visible check applies (legacy behavior).
   * - `null`: the caller supports arrival checks but doesn't have a value yet
   *   (e.g. still loading); the hook waits for a real value before deciding.
   * - `number`: evaluated once — if it meets/exceeds `staleness`, a single
   *   non-blocking background refresh fires immediately on arrival, without
   *   waiting for a hidden→visible transition.
   */
  initialDataAge?: number | null;
}

export interface UseAutoRefreshReturn {
  /** True while a background (visibility- or arrival-triggered) refresh is in progress */
  isBackgroundRefreshing: boolean;
  /** Epoch ms of last successful refresh, or null if never refreshed */
  lastRefreshedAt: number | null;
  /**
   * The error from the most recent background refresh attempt, or null if the
   * last attempt succeeded (or none has run yet). Cached/last-known data is
   * never cleared on failure — this is purely a signal so the UI can show a
   * "may be out of date" indicator alongside the existing data.
   */
  lastRefreshError: unknown;
  /** Manually trigger a refresh (resets staleness timer) */
  forceRefresh: () => Promise<void>;
}

/**
 * Staleness-aware auto-refresh hook.
 *
 * Covers two triggers for a silent, non-blocking background refresh:
 * 1. Initial arrival — if `initialDataAge` shows the data already on screen
 *    exceeds `staleness`, refresh once immediately after mount.
 * 2. Hidden→visible — when the page becomes visible after being hidden for
 *    >5s, checks if data exceeds the staleness threshold and refreshes if so.
 *
 * Both triggers share the same in-flight guard, so an arrival refresh and a
 * near-simultaneous visibility refresh can never double-fire.
 */
export function useAutoRefresh(options: UseAutoRefreshOptions): UseAutoRefreshReturn {
  const { key, staleness, onRefresh, enabled = true, initialDataAge } = options;

  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [lastRefreshError, setLastRefreshError] = useState<unknown>(null);

  const inFlightRef = useRef(false);
  const lastRefreshedAtRef = useRef<number | null>(null);
  const initialCheckDoneRef = useRef(false);
  const initialDataAgeRef = useRef(initialDataAge);
  initialDataAgeRef.current = initialDataAge;

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
        setLastRefreshError(null);
      } catch (error) {
        // Background refresh errors never throw to the caller and never clear
        // last-known data — only surfaced via `lastRefreshError` for the UI.
        console.error(`[useAutoRefresh:${key}] refresh failed:`, error);
        setLastRefreshError(error);
      } finally {
        inFlightRef.current = false;
        if (background) setIsBackgroundRefreshing(false);
      }
    },
    [key, onRefresh, enabled]
  );

  // On initial arrival: if the data already on screen is stale, refresh once,
  // non-blockingly, without waiting for a hidden→visible transition.
  useEffect(() => {
    if (initialCheckDoneRef.current) return;
    if (!enabled) return;

    const age = initialDataAgeRef.current;
    if (age === undefined) {
      // Caller doesn't use the arrival-check feature — nothing to evaluate.
      initialCheckDoneRef.current = true;
      return;
    }
    if (age === null) {
      // Caller supports arrival checks but has no value yet — wait for one.
      return;
    }

    initialCheckDoneRef.current = true;

    // Seed the staleness clock from the real data timestamp so the next
    // hidden→visible check measures actual freshness instead of treating
    // never-refreshed-by-this-hook as infinitely stale.
    const reconstructedTimestamp = Date.now() - age;
    lastRefreshedAtRef.current = reconstructedTimestamp;
    setLastRefreshedAt(reconstructedTimestamp);

    if (age >= staleness) {
      doRefresh(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, staleness, doRefresh, initialDataAge]);

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

  return { isBackgroundRefreshing, lastRefreshedAt, lastRefreshError, forceRefresh };
}
