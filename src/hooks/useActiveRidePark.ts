'use client';

import { useEffect, useState } from 'react';
import { getActiveTrip, getTripRideLogs } from '@/lib/services/trip-service';
import type { RideLog } from '@/types/ride-log';

type RideLogWithId = RideLog & { id: string };
export const ACTIVE_RIDE_PARK_READ_TIMEOUT_MS = 8_000;
export type ActiveRideParkErrorKind = 'active-trip' | 'recent-rides';

function withReadDeadline<T>(operation: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ACTIVE_RIDE_PARK_READ_TIMEOUT_MS);
  });
  return Promise.race([operation, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function toLocalDateKey(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function rideDate(log: RideLogWithId): Date {
  const raw = log.rodeAt as unknown;
  if (raw instanceof Date) return raw;
  if (raw && typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate();
  }
  return new Date(raw as string | number);
}

export function getMostRecentRideParkId(
  logs: RideLogWithId[],
  dateKey: string,
): string | null {
  return logs
    .filter((log) => toLocalDateKey(rideDate(log)) === dateKey)
    .sort((a, b) => rideDate(b).getTime() - rideDate(a).getTime())[0]?.parkId ?? null;
}

interface UseActiveRideParkOptions {
  enabled: boolean;
  userId?: string;
  dateKey?: string;
  tripId?: string;
  tripName?: string | null;
}

export function useActiveRidePark({
  enabled,
  userId,
  dateKey = toLocalDateKey(),
  tripId,
  tripName = null,
}: UseActiveRideParkOptions) {
  const [resolvedTripId, setResolvedTripId] = useState<string | null>(tripId ?? null);
  const [resolvedTripName, setResolvedTripName] = useState<string | null>(tripName);
  const [recentParkId, setRecentParkId] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ActiveRideParkErrorKind | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [standaloneVersion, setStandaloneVersion] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || !userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setErrorKind(null);
    setRecentParkId(null);

    const load = async () => {
      let activeTrip: { id: string; name?: string | null } | null;
      try {
        activeTrip = tripId
          ? { id: tripId, name: tripName }
          : standaloneVersion === retryVersion
            ? null
            : await withReadDeadline(
              getActiveTrip(userId),
              'Active trip lookup timed out.',
            );
      } catch {
        if (!cancelled) {
          setResolvedTripId(null);
          setResolvedTripName(null);
          setErrorKind('active-trip');
          setError('Could not check for an active trip. Retry, or explicitly log this ride as standalone.');
        }
        return;
      }

      if (cancelled) return;
      setResolvedTripId(activeTrip?.id ?? null);
      setResolvedTripName(activeTrip?.name ?? null);

      if (!activeTrip?.id) {
        setRecentParkId(null);
        return;
      }

      try {
        const logs = await withReadDeadline(
          getTripRideLogs(userId, activeTrip.id),
          'Recent ride lookup timed out.',
        );
        if (!cancelled) {
          setRecentParkId(getMostRecentRideParkId(logs, dateKey));
        }
      } catch {
        if (!cancelled) {
          setRecentParkId(null);
          setErrorKind('recent-rides');
          setError('Could not load recent rides for this trip. Choose a park explicitly, or retry.');
        }
      }
    };

    void load()
      .catch(() => {
        if (!cancelled) {
          setResolvedTripId(tripId ?? null);
          setResolvedTripName(tripName);
          setRecentParkId(null);
          setErrorKind(tripId ? 'recent-rides' : 'active-trip');
          setError(
            tripId
              ? 'Could not load recent rides for this trip. Choose a park explicitly, or retry.'
              : 'Could not check for an active trip. Retry, or explicitly log this ride as standalone.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dateKey, enabled, retryVersion, standaloneVersion, tripId, tripName, userId]);

  return {
    tripId: resolvedTripId,
    tripName: resolvedTripName,
    recentParkId,
    setRecentParkId,
    loading,
    error,
    errorKind,
    retry: () => {
      setStandaloneVersion(null);
      setRetryVersion((value) => value + 1);
    },
    continueStandalone: () => {
      setResolvedTripId(null);
      setResolvedTripName(null);
      setRecentParkId(null);
      setError(null);
      setErrorKind(null);
      setStandaloneVersion(retryVersion);
    },
  };
}
