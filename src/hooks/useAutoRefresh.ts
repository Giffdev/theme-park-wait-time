'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVisibility } from './useVisibility';

export interface UseAutoRefreshOptions {
  /** Unique identifier for this data (used for debugging) */
  key: string;
  /** Milliseconds before data is considered stale */
  staleness: number;
  /**
   * Async function to refresh data — should update component state internally.
   * Return the source snapshot timestamp when a successful response can still
   * contain older cached data, so staleness remains anchored to the data rather
   * than the request completion time.
   */
  onRefresh: () => Promise<void | { refreshedAt: number }>;
  /** Disable auto-refresh (e.g., while page is still loading) */
  enabled?: boolean;
  /**
   * Optional periodic polling cadence for pages that should refresh while
   * they remain open. When cached-data age is known, the first check runs at
   * the remaining staleness boundary; later checks run after the previous
   * check or refresh completes. Poll-enabled callers defer a stale arrival
   * while hidden or offline until visibility/connectivity returns. Visibility
   * returns while offline are intentionally ignored rather than attempting a
   * doomed refresh; reconnecting checks immediately instead. When omitted, the
   * hook keeps the legacy arrival behavior, including refreshing stale
   * rendered data even if the page mounts hidden or offline.
   */
  pollIntervalMs?: number;
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
  /** True only while the one-time initial-arrival refresh is in progress */
  isInitialRefreshing: boolean;
  /** True while visibility and connectivity allow an automatic refresh to start */
  isAutoRefreshRunnable: boolean;
  /** Epoch ms of last successful refresh, or null if never refreshed */
  lastRefreshedAt: number | null;
  /**
   * The error from the most recent background refresh attempt, or null if the
   * last refresh succeeded (or none has run yet). Cached/last-known data is
   * never cleared on failure — this is purely a signal so the UI can show a
   * "may be out of date" indicator alongside the existing data.
   */
  lastRefreshError: unknown;
  /** Manually trigger a refresh; rejects on failure and resets staleness on success. */
  forceRefresh: () => Promise<void>;
}

function isBrowserRefreshRunnable(): boolean {
  const isVisible =
    typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const isOnline = typeof navigator === 'undefined' || navigator.onLine;
  return isVisible && isOnline;
}

/**
 * Staleness-aware auto-refresh hook.
 *
 * Covers three triggers for a silent, non-blocking background refresh:
 * 1. Initial arrival — if `initialDataAge` shows the data already on screen
 *    exceeds `staleness`, refresh once immediately after mount.
 * 2. Hidden→visible — non-poll callers use the 5s debounce before checking
 *    staleness; poll-enabled callers use zero debounce for prompt catch-up.
 * 3. Optional polling — while the page remains visible and online, checks for
 *    stale data at `pollIntervalMs`. Reconnecting also checks immediately, and
 *    visibility returns while offline are treated as no-ops rather than failed
 *    refresh attempts.
 *
 * All triggers share the same in-flight guard, so concurrent refresh signals
 * can never produce overlapping requests.
 */
export function useAutoRefresh(options: UseAutoRefreshOptions): UseAutoRefreshReturn {
  const { key, staleness, onRefresh, enabled = true, pollIntervalMs, initialDataAge } = options;
  const hasConcreteInitialDataAge = typeof initialDataAge === 'number';

  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [isInitialRefreshing, setIsInitialRefreshing] = useState(false);
  const [isAutoRefreshRunnable, setIsAutoRefreshRunnable] = useState(
    () => enabled && isBrowserRefreshRunnable()
  );
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [lastRefreshError, setLastRefreshError] = useState<unknown>(null);

  const inFlightRef = useRef<{
    key: string;
    promise: Promise<void>;
    background: boolean;
    initial: boolean;
  } | null>(null);
  const activeKeyRef = useRef(key);
  const enabledRef = useRef(enabled);
  const stalenessRef = useRef(staleness);
  const pollingEnabledRef = useRef(
    typeof pollIntervalMs === 'number' && pollIntervalMs > 0
  );
  const pollIntervalRef = useRef<number | null>(
    typeof pollIntervalMs === 'number' && pollIntervalMs > 0 ? pollIntervalMs : null
  );
  const pollTimerRef = useRef<number | null>(null);
  const pollGenerationRef = useRef(0);
  const pollSchedulerActiveRef = useRef(false);
  const scheduleNextPollRef = useRef<((delay: number) => void) | null>(null);
  const onlineRef = useRef(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const lastRefreshedAtRef = useRef<number | null>(null);
  const initialCheckDoneRef = useRef(false);
  const mountedRef = useRef(false);
  const initialDataAgeRef = useRef(initialDataAge);
  initialDataAgeRef.current = initialDataAge;
  enabledRef.current = enabled;
  stalenessRef.current = staleness;
  pollingEnabledRef.current = typeof pollIntervalMs === 'number' && pollIntervalMs > 0;
  pollIntervalRef.current =
    typeof pollIntervalMs === 'number' && pollIntervalMs > 0 ? pollIntervalMs : null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doRefresh = useCallback(
    (background: boolean, propagateError = false, initial = false): Promise<void> => {
      const existing = inFlightRef.current;
      if (existing?.key === key) {
        if (
          background
          && initial
          && mountedRef.current
          && activeKeyRef.current === key
        ) {
          existing.background = true;
          existing.initial = true;
          setIsBackgroundRefreshing(true);
          setIsInitialRefreshing(true);
        }
        return propagateError ? existing.promise : existing.promise.catch(() => {});
      }
      if (!enabled) return Promise.resolve();

      const refreshKey = key;
      if (background && mountedRef.current && activeKeyRef.current === refreshKey) {
        setIsBackgroundRefreshing(true);
        if (initial) {
          setIsInitialRefreshing(true);
        }
      }

      const flight = {
        key: refreshKey,
        promise: Promise.resolve(),
        background,
        initial,
      };
      flight.promise = (async () => {
        try {
          const refreshResult = await onRefresh();
          if (!mountedRef.current || activeKeyRef.current !== refreshKey) return;
          const now = Date.now();
          const reportedRefreshedAt = refreshResult?.refreshedAt;
          const refreshedAt =
            typeof reportedRefreshedAt === 'number' && Number.isFinite(reportedRefreshedAt)
              ? Math.min(now, reportedRefreshedAt)
              : now;
          lastRefreshedAtRef.current = refreshedAt;
          setLastRefreshedAt(refreshedAt);
          setLastRefreshError(null);

          const activePollInterval = pollIntervalRef.current;
          if (pollSchedulerActiveRef.current && activePollInterval !== null) {
            scheduleNextPollRef.current?.(activePollInterval);
          }
        } catch (error) {
          if (flight.background) {
            console.error(`[useAutoRefresh:${refreshKey}] refresh failed:`, error);
          }
          if (flight.background && mountedRef.current && activeKeyRef.current === refreshKey) {
            setLastRefreshError(error);
          }
          throw error;
        } finally {
          if (inFlightRef.current === flight) {
            inFlightRef.current = null;
          }
          if (flight.background && mountedRef.current && activeKeyRef.current === refreshKey) {
            setIsBackgroundRefreshing(false);
          }
          if (flight.initial && mountedRef.current && activeKeyRef.current === refreshKey) {
            setIsInitialRefreshing(false);
          }
        }
      })();

      inFlightRef.current = flight;
      return propagateError ? flight.promise : flight.promise.catch(() => {});
    },
    [key, onRefresh, enabled]
  );

  const doRefreshRef = useRef(doRefresh);
  doRefreshRef.current = doRefresh;

  const maybeRefresh = useCallback(
    (background: boolean, initial = false): Promise<void> => {
      if (!enabledRef.current) return Promise.resolve();
      if (pollingEnabledRef.current && !initialCheckDoneRef.current) {
        return Promise.resolve();
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return Promise.resolve();
      }
      if (!onlineRef.current) return Promise.resolve();

      const last = lastRefreshedAtRef.current;
      const age = last === null ? Infinity : Date.now() - last;
      if (age >= stalenessRef.current) {
        return doRefreshRef.current(background, false, initial);
      }
      return Promise.resolve();
    },
    []
  );

  const maybeRefreshRef = useRef(maybeRefresh);
  maybeRefreshRef.current = maybeRefresh;

  const cancelScheduledPoll = useCallback(() => {
    pollGenerationRef.current += 1;
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const scheduleNextPoll = useCallback((delay: number) => {
    cancelScheduledPoll();
    if (
      !pollSchedulerActiveRef.current
      || !enabledRef.current
      || !pollingEnabledRef.current
    ) {
      return;
    }

    const generation = pollGenerationRef.current;
    pollTimerRef.current = window.setTimeout(async () => {
      if (pollGenerationRef.current !== generation) return;
      pollTimerRef.current = null;

      await maybeRefreshRef.current(true);

      // A successful refresh installs the next timer from its own completion.
      // Skipped or failed checks retain cadence from this completed check.
      if (pollGenerationRef.current === generation) {
        const activePollInterval = pollIntervalRef.current;
        if (activePollInterval !== null) {
          scheduleNextPollRef.current?.(activePollInterval);
        }
      }
    }, Math.max(0, delay));
  }, [cancelScheduledPoll]);
  scheduleNextPollRef.current = scheduleNextPoll;

  // A client-side route/data-key change can reuse the same mounted hook
  // instance. Treat the new key as a fresh arrival while allowing an older
  // key's in-flight promise to finish without mutating the new key's state.
  useEffect(() => {
    activeKeyRef.current = key;
    initialCheckDoneRef.current = false;
    lastRefreshedAtRef.current = null;
    setLastRefreshedAt(null);
    setLastRefreshError(null);
    setIsBackgroundRefreshing(false);
    setIsInitialRefreshing(false);
  }, [key]);

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
      if (pollingEnabledRef.current) {
        void maybeRefresh(true, true);
      } else {
        // Preserve the shared legacy arrival contract for non-poll callers:
        // rendered stale data refreshes even when mounted hidden or offline.
        void doRefreshRef.current(true, false, true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, staleness, maybeRefresh, initialDataAge]);

  useEffect(() => {
    if (!enabled) {
      setIsAutoRefreshRunnable(false);
      return;
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      setIsAutoRefreshRunnable(enabled);
      return;
    }

    onlineRef.current = typeof navigator === 'undefined' ? true : navigator.onLine;
    const syncRefreshAvailability = () => {
      setIsAutoRefreshRunnable(enabled && isBrowserRefreshRunnable());
    };
    syncRefreshAvailability();

    function handleOnline() {
      onlineRef.current = true;
      syncRefreshAvailability();
      void maybeRefresh(true);
    }

    function handleOffline() {
      onlineRef.current = false;
      syncRefreshAvailability();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', syncRefreshAvailability);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', syncRefreshAvailability);
    };
  }, [enabled, key, maybeRefresh]);

  // Re-anchor once when a delayed initial age becomes concrete. Depending on
  // the numeric age itself would reset this timer whenever callers recompute
  // `Date.now() - capturedAt` during an unrelated render.
  useEffect(() => {
    if (!enabled || !pollIntervalMs || pollIntervalMs <= 0) return;

    pollSchedulerActiveRef.current = true;

    const lastRefreshedAt = lastRefreshedAtRef.current;
    const currentAge = lastRefreshedAt === null
      ? null
      : Math.max(0, Date.now() - lastRefreshedAt);
    const remainingFreshness = currentAge === null
      ? null
      : stalenessRef.current - currentAge;

    // A stale arrival is already refreshed by the arrival effect. Starting
    // that case (or an unknown-age case) at the normal cadence avoids a
    // redundant zero-delay check while fresh data uses its true boundary.
    const initialDelay = remainingFreshness !== null && remainingFreshness > 0
      ? remainingFreshness
      : pollIntervalMs;
    scheduleNextPoll(initialDelay);

    return () => {
      pollSchedulerActiveRef.current = false;
      cancelScheduledPoll();
    };
  }, [
    enabled,
    key,
    pollIntervalMs,
    hasConcreteInitialDataAge,
    scheduleNextPoll,
    cancelScheduledPoll,
  ]);

  // On visibility return: check staleness, refresh if needed
  useVisibility(
    useCallback(() => {
      void maybeRefresh(true);
    }, [maybeRefresh]),
    { debounceMs: pollIntervalMs === undefined ? 5000 : 0 }
  );

  const forceRefresh = useCallback(async () => {
    await doRefresh(false, true);
  }, [doRefresh]);

  return {
    isBackgroundRefreshing,
    isInitialRefreshing,
    isAutoRefreshRunnable,
    lastRefreshedAt,
    lastRefreshError,
    forceRefresh,
  };
}
