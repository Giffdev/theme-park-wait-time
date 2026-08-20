'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  refreshAllParksWaitTimes,
  type AllParksWaitTimesResponse,
} from '@/lib/wait-times/client';
import { useAutoRefresh } from './useAutoRefresh';

// The all-parks route can fan out across the full configured catalog with a
// 20-second server budget. Its server read-through TTL is 45 seconds and its
// Vercel edge response is shared for 30 seconds, but polling it every two
// minutes would still create needless runtime/upstream pressure. Ten minutes
// matches the listing's existing user-visible stale boundary and limits each
// continuously visible client to six refresh attempts per hour.
export const ALL_PARKS_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

interface UseAllParksAutoRefreshOptions {
  enabled?: boolean;
  initialDataAge?: number | null;
  onSnapshot?: (snapshot: AllParksWaitTimesResponse) => void;
}

export function useAllParksAutoRefresh({
  enabled = true,
  initialDataAge,
  onSnapshot,
}: UseAllParksAutoRefreshOptions) {
  const [snapshot, setSnapshot] = useState<AllParksWaitTimesResponse | null>(null);
  const mountedRef = useRef(false);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const nextSnapshot = await refreshAllParksWaitTimes();
    if (mountedRef.current) {
      setSnapshot(nextSnapshot);
      onSnapshotRef.current?.(nextSnapshot);
    }

    const sourceTimestamps = Object.values(nextSnapshot.parkMeta)
      .map((meta) => new Date(meta.fetchedAt).getTime())
      .filter(Number.isFinite);
    return {
      refreshedAt: sourceTimestamps.length > 0
        ? Math.min(...sourceTimestamps)
        : new Date(nextSnapshot.fetchedAt).getTime(),
    };
  }, []);

  const autoRefresh = useAutoRefresh({
    key: 'all-parks-provider',
    staleness: ALL_PARKS_REFRESH_INTERVAL_MS,
    pollIntervalMs: ALL_PARKS_REFRESH_INTERVAL_MS,
    onRefresh: refresh,
    enabled,
    initialDataAge,
  });

  return { ...autoRefresh, snapshot };
}
