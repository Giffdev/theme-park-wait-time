'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  canonicalFirestoreTimestamp,
  compareFirestoreTimestamps,
  firestoreTimestampToDate,
  type CanonicalFirestoreTimestamp,
} from '@/lib/firestore-timestamp';
import { refreshTripStatsAfterMutation } from '@/lib/services/ride-log-service';
import type { Trip, TripStats } from '@/types/trip';

interface TripCardProps {
  trip: Trip & { id: string };
}

function statusBadge(status: Trip['status']) {
  switch (status) {
    case 'active':
      return <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Active</span>;
    case 'planning':
      return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">Upcoming</span>;
    case 'completed':
      return <span className="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700">Completed</span>;
  }
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (start === end) return s.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', { ...opts, year: sameYear ? undefined : 'numeric' })}, ${e.getFullYear()}`;
}

export default function TripCard({ trip }: TripCardProps) {
  const initialTimestamp = canonicalFirestoreTimestamp(trip.statsUpdatedAt);
  const [refreshState, setRefreshState] = useState<'idle' | 'loading' | 'stale'>('idle');
  const [displayedStats, setDisplayedStats] = useState<TripStats>(trip.stats);
  const [displayedStatsUpdatedAt, setDisplayedStatsUpdatedAt] =
    useState<CanonicalFirestoreTimestamp | null>(
      initialTimestamp,
  );
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const refreshController = useRef<AbortController | null>(null);
  const requestEpoch = useRef(0);
  const currentTripId = useRef(trip.id);
  const authoritativeTimestamp = useRef<CanonicalFirestoreTimestamp | null>(initialTimestamp);
  const parkNamesList = Object.values(trip.parkNames ?? {});
  const displayedStatsDate = displayedStatsUpdatedAt
    ? firestoreTimestampToDate(displayedStatsUpdatedAt)
    : null;
  const isEmptyUnrefreshedTrip = displayedStats.totalRides === 0 && !displayedStatsDate;
  const statsAreStale = !isEmptyUnrefreshedTrip && (
    !displayedStatsDate
    || Date.now() - displayedStatsDate.getTime() > 5 * 60 * 1000
  );

  const refreshStats = async () => {
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    const epoch = ++requestEpoch.current;
    const requestedTripId = trip.id;
    setRefreshState('loading');
    setRetryAt(null);
    try {
      const result = await refreshTripStatsAfterMutation(trip.id, controller.signal);
      if (controller.signal.aborted
          || epoch !== requestEpoch.current
          || requestedTripId !== currentTripId.current) return;
      if (typeof result === 'object' && result.status === 'updated') {
        const resultTimestamp = canonicalFirestoreTimestamp(result.statsUpdatedAt);
        if (!resultTimestamp) {
          setRefreshState('stale');
          return;
        }
        if (authoritativeTimestamp.current
            && compareFirestoreTimestamps(
              resultTimestamp,
              authoritativeTimestamp.current,
            ) <= 0) {
          setRefreshState('idle');
          return;
        }
        authoritativeTimestamp.current = resultTimestamp;
        setDisplayedStats(result.stats);
        setDisplayedStatsUpdatedAt(resultTimestamp);
        setRefreshState('idle');
      } else {
        setRetryAt(typeof result === 'object' ? result.retryAt : null);
        setRefreshState('stale');
      }
    } catch {
      if (controller.signal.aborted) return;
      setRefreshState('stale');
    }
  };

  useEffect(() => {
    const nextTimestamp = canonicalFirestoreTimestamp(trip.statsUpdatedAt);
    const tripChanged = currentTripId.current !== trip.id;
    const propsAreAuthoritative = tripChanged
      || authoritativeTimestamp.current === null
      || (nextTimestamp !== null
        && compareFirestoreTimestamps(
          nextTimestamp,
          authoritativeTimestamp.current,
        ) >= 0);
    if (!propsAreAuthoritative) return;
    requestEpoch.current += 1;
    refreshController.current?.abort();
    refreshController.current = null;
    currentTripId.current = trip.id;
    authoritativeTimestamp.current = nextTimestamp;
    setDisplayedStats({
      totalRides: trip.stats.totalRides,
      totalWaitMinutes: trip.stats.totalWaitMinutes,
      parksVisited: trip.stats.parksVisited,
      uniqueAttractions: trip.stats.uniqueAttractions,
      favoriteAttraction: trip.stats.favoriteAttraction,
    });
    setDisplayedStatsUpdatedAt(nextTimestamp);
    setRefreshState('idle');
    setRetryAt(null);
  }, [
    trip.id,
    trip.stats.totalRides,
    trip.stats.totalWaitMinutes,
    trip.stats.parksVisited,
    trip.stats.uniqueAttractions,
    trip.stats.favoriteAttraction,
    trip.statsUpdatedAt,
  ]);

  useEffect(() => () => refreshController.current?.abort(), []);

  return (
    <div className="rounded-xl border border-primary-100 bg-white shadow-sm transition-all hover:border-primary-200 hover:shadow-md">
      <Link href={`/trips/${trip.id}`} className="group block p-5 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-primary-900 group-hover:text-primary-700">
            {trip.name}
          </h3>
          <p className="mt-1 text-sm text-primary-500">{formatDateRange(trip.startDate, trip.endDate)}</p>
        </div>
        {statusBadge(trip.status)}
      </div>

      {parkNamesList.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {parkNamesList.slice(0, 4).map((name) => (
            <span key={name} className="rounded-md bg-primary-50 px-2 py-0.5 text-xs text-primary-600">
              {name}
            </span>
          ))}
          {parkNamesList.length > 4 && (
            <span className="rounded-md bg-primary-50 px-2 py-0.5 text-xs text-primary-500">
              +{parkNamesList.length - 4} more
            </span>
          )}
        </div>
      ) : displayedStats.parksVisited > 0 && (
        <div className="mt-3">
          <span className="rounded-md bg-primary-50 px-2 py-0.5 text-xs text-primary-500">
            🏰 {displayedStats.parksVisited} park{displayedStats.parksVisited !== 1 ? 's' : ''} visited
          </span>
        </div>
      )}

      {displayedStats.totalRides > 0 && (
        <div className="mt-3 flex gap-4 text-xs text-primary-500">
          <span>🎢 {displayedStats.totalRides} rides</span>
          <span>⏱️ {displayedStats.totalWaitMinutes} min waited</span>
          <span>🏰 {displayedStats.parksVisited} parks</span>
        </div>
      )}
      <p role="status" aria-live="polite" className={`mt-3 text-xs ${statsAreStale ? 'text-amber-700' : 'text-primary-400'}`}>
        {isEmptyUnrefreshedTrip
          ? 'No rides logged yet'
          : statsAreStale
          ? 'Ride summary refresh pending'
          : `Ride summary updated ${displayedStatsDate!.toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}`}
      </p>
      </Link>
      {statsAreStale && (
        <div className="px-5 pb-4">
          <button
            type="button"
            onClick={refreshStats}
            disabled={refreshState === 'loading'}
            className="text-xs font-medium text-primary-700 underline disabled:opacity-50"
          >
            {refreshState === 'loading' ? 'Refreshing summary…' : 'Refresh ride summary'}
          </button>
          {refreshState === 'stale' && (
            <p role="alert" className="mt-1 text-xs text-amber-700">
              {retryAt && retryAt > Date.now()
                ? `Refresh is throttled until ${new Date(retryAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}. Your ride changes are saved.`
                : 'Summary is still pending. Your ride changes are saved.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
