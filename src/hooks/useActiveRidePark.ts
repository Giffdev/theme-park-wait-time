'use client';

import { useEffect, useState } from 'react';
import { getActiveTrip, getTripRideLogs } from '@/lib/services/trip-service';
import type { RideLog } from '@/types/ride-log';

type RideLogWithId = RideLog & { id: string };

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
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!enabled || !userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setRecentParkId(null);

    const load = async () => {
      const activeTrip = tripId
        ? { id: tripId, name: tripName }
        : await getActiveTrip(userId);

      if (cancelled) return;
      setResolvedTripId(activeTrip?.id ?? null);
      setResolvedTripName(activeTrip?.name ?? null);

      if (!activeTrip?.id) {
        setRecentParkId(null);
        return;
      }

      const logs = await getTripRideLogs(
        userId,
        activeTrip.id,
      );
      if (!cancelled) {
        setRecentParkId(getMostRecentRideParkId(logs, dateKey));
      }
    };

    void load()
      .catch(() => {
        if (!cancelled) {
          setResolvedTripId(tripId ?? null);
          setResolvedTripName(tripName);
          setRecentParkId(null);
          setError(
            tripId
              ? 'Could not load recent rides for this trip. Retry before logging.'
              : 'Could not check for an active trip. Retry before choosing standalone logging.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dateKey, enabled, retryVersion, tripId, tripName, userId]);

  return {
    tripId: resolvedTripId,
    tripName: resolvedTripName,
    recentParkId,
    setRecentParkId,
    loading,
    error,
    retry: () => setRetryVersion((value) => value + 1),
  };
}
