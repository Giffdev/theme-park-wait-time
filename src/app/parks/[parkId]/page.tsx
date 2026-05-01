'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, ArrowUpDown, TrendingUp, Clock, AlertCircle, MapPin } from 'lucide-react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import UnifiedLogSheet from '@/components/UnifiedLogSheet';
import { getCollection, whereConstraint } from '@/lib/firebase/firestore';
import { DESTINATION_FAMILIES } from '@/lib/parks/park-registry';
import { getLocationByDestinationId, formatLocation } from '@/lib/parks/park-locations';
import AttractionRow from '@/components/AttractionRow';
import AttractionFilterChips, {
  type FilterState,
  type EntityType,
} from '@/components/parks/AttractionFilterChips';
import RideDetailPanel from '@/components/parks/RideDetailPanel';
import ParkScheduleBar from '@/components/parks/ParkScheduleBar';
import ParkOperatingStatus from '@/components/parks/ParkOperatingStatus';
import type { AttractionType } from '@/types/attraction';
import { classifyAttraction } from '@/lib/utils/classify-attraction';
import type { QueueData, ForecastEntry, OperatingHoursEntry, ScheduleSegment, ForecastMeta } from '@/types/queue';

interface Park {
  id: string;
  name: string;
  slug: string;
  destinationName: string;
  destinationId: string;
}

interface Attraction {
  id: string;
  name: string;
  parkId: string;
  parkName: string;
  entityType: string;
  attractionType?: AttractionType | null;
  slug: string;
}

interface WaitTimeEntry {
  id: string;
  attractionId: string;
  attractionName: string;
  status: string;
  waitMinutes: number | null;
  lastUpdated: string | null;
  fetchedAt: string;
  queue?: QueueData | null;
  forecast?: ForecastEntry[] | null;
  forecastMeta?: ForecastMeta | null;
  operatingHours?: OperatingHoursEntry[] | null;
}

interface ParkScheduleData {
  segments: ScheduleSegment[];
  timezone: string;
}

export default function ParkDetailPage() {
  const { parkId } = useParams<{ parkId: string }>();
  const [park, setPark] = useState<Park | null>(null);
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [waitTimes, setWaitTimes] = useState<WaitTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [waitTimesLoading, setWaitTimesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    entityTypes: new Set<EntityType>(['ATTRACTION', 'SHOW']),
    attractionTypes: new Set<AttractionType>(),
  });
  const [selectedRide, setSelectedRide] = useState<{
    attractionId: string;
    name: string;
    entityType: string;
    status: string;
    waitMinutes: number | null;
    queue?: QueueData | null;
    forecast?: ForecastEntry[] | null;
    forecastMeta?: ForecastMeta | null;
    operatingHours?: OperatingHoursEntry[] | null;
  } | null>(null);
  const [schedule, setSchedule] = useState<ParkScheduleData | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [quickLogOpen, setQuickLogOpen] = useState(false);

  // Auto-refresh wait times when user returns to tab after 2+ minutes
  const { isBackgroundRefreshing } = useAutoRefresh({
    key: `park-wait-times-${parkId}`,
    staleness: 2 * 60 * 1000, // 2 minutes
    onRefresh: async () => {
      await fetchWaitTimes(park);
    },
    enabled: !!park && !refreshing,
  });

  // Auto-refresh schedule when user returns after 30+ minutes
  useAutoRefresh({
    key: `park-schedule-${parkId}`,
    staleness: 30 * 60 * 1000, // 30 minutes
    onRefresh: async () => {
      if (!park) return;
      try {
        const res = await fetch(`/api/park-schedule?parkId=${park.id}`);
        if (res.ok) {
          const scheduleData = await res.json();
          setSchedule(scheduleData);
        }
      } catch { /* background refresh — silent fail */ }
    },
    enabled: !!park && !refreshing,
  });

  // Tick every 30s so relative time stays fresh
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Derive the most recent fetchedAt across all wait time entries
  const dataFreshness = useMemo(() => {
    if (waitTimes.length === 0) return null;
    const timestamps = waitTimes
      .map((w) => w.fetchedAt)
      .filter(Boolean)
      .map((ts) => new Date(ts).getTime())
      .filter((t) => !isNaN(t));
    if (timestamps.length === 0) return null;
    const latest = Math.max(...timestamps);
    const ageMs = now - latest;
    const ageMin = Math.round(ageMs / 60_000);
    const isStale = ageMin >= 10;
    let label: string;
    if (ageMin < 1) {
      label = 'Updated just now';
    } else if (ageMin === 1) {
      label = 'Updated 1 min ago';
    } else if (ageMin < 60) {
      label = `Updated ${ageMin} min ago`;
    } else {
      label = `Updated as of ${new Date(latest).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    return { label, isStale };
  }, [waitTimes, now]);

  // Phase 1: Load park info + attraction list (instant render)
  const fetchCore = useCallback(async () => {
    if (!parkId) return null;
    try {
      const parkDocs = await getCollection<Park>('parks', [whereConstraint('slug', '==', parkId)]);
      const parkDoc = parkDocs.length > 0 ? parkDocs[0] : null;
      setPark(parkDoc);

      if (!parkDoc) {
        setLoading(false);
        return null;
      }

      const parkUuid = parkDoc.id;
      const attractionDocs = await getCollection<Attraction>('attractions', [whereConstraint('parkId', '==', parkUuid)]);
      setAttractions(attractionDocs);
      setLoading(false);
      return parkDoc;
    } catch (error) {
      console.error('Failed to fetch park core data:', error);
      setLoading(false);
      return null;
    }
  }, [parkId]);

  // Phase 2: Load wait times + schedule (overlay onto already-visible UI)
  const fetchWaitTimes = useCallback(async (parkDoc?: Park | null) => {
    const targetPark = parkDoc || park;
    if (!targetPark) return null;
    setWaitTimesLoading(true);
    try {
      const parkUuid = targetPark.id;
      const [waitDocs, scheduleRes] = await Promise.all([
        getCollection<WaitTimeEntry>(`waitTimes/${parkUuid}/current`),
        fetch(`/api/park-schedule?parkId=${parkUuid}`, { cache: 'no-store' }).catch(() => null),
      ]);
      setWaitTimes(waitDocs);

      if (scheduleRes && scheduleRes.ok) {
        const scheduleData = await scheduleRes.json();
        setSchedule(scheduleData);
      }

      return waitDocs;
    } catch (error) {
      console.error('Failed to fetch wait times:', error);
      return null;
    } finally {
      setWaitTimesLoading(false);
    }
  }, [park]);

  useEffect(() => {
    async function initLoad() {
      // Phase 1: show park + attractions immediately
      const parkDoc = await fetchCore();
      if (!parkDoc) return;

      // Phase 2: load wait times (non-blocking — UI already visible)
      const waitDocs = await fetchWaitTimes(parkDoc);

      // Phase 3: background forecast refresh (fire-and-forget, never blocks UI)
      if (waitDocs && waitDocs.length > 0) {
        const hasForecast = waitDocs.some((w) => w.forecast && w.forecast.length > 0);
        if (!hasForecast) {
          fetch(`/api/wait-times?parkId=${parkDoc.id}`)
            .then(() => fetchWaitTimes(parkDoc))
            .catch(() => { /* Non-critical */ });
        }
      }
    }
    initLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkId]);

  const handleRefresh = async () => {
    if (!park) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch(`/api/wait-times?parkId=${park.id}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      await fetchWaitTimes(park);
    } catch (error) {
      console.error('Refresh failed:', error);
      const message =
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'Refresh timed out — try again later.'
          : 'Refresh failed — please try again.';
      setRefreshError(message);
    } finally {
      setRefreshing(false);
    }
  };

  // Merge wait times into attractions (memoized to avoid re-running classifyAttraction on every render)
  const waitMap = useMemo(
    () => new Map(waitTimes.map((w) => [w.attractionId, w])),
    [waitTimes]
  );

  const mergedAttractions = useMemo(() => {
    return attractions.map((a) => {
      const wt = waitMap.get(a.id);
      // Use stored attractionType if available, otherwise classify client-side
      const effectiveAttractionType = a.attractionType || classifyAttraction(a.name, a.entityType);
      return {
        ...a,
        attractionType: effectiveAttractionType,
        status: wt?.status || (waitTimesLoading ? 'UNKNOWN' : 'CLOSED'),
        waitMinutes: wt?.waitMinutes ?? null,
        queue: wt?.queue ?? null,
        forecast: wt?.forecast ?? null,
        forecastMeta: wt?.forecastMeta ?? null,
        operatingHours: wt?.operatingHours ?? null,
      };
    });
  }, [attractions, waitMap, waitTimesLoading]);

  const availableAttractionTypes = useMemo(() => {
    const types = new Set<AttractionType>();
    mergedAttractions
      .filter(a => a.entityType === 'ATTRACTION')
      .forEach(a => {
        if (a.attractionType) types.add(a.attractionType);
      });
    return types;
  }, [mergedAttractions]);

  // Apply entity type + attraction type filters
  const filteredAttractions = mergedAttractions.filter((a) => {
    // Never show merchandise
    if (a.entityType === 'MERCHANDISE') return false;

    // Tier 1: entity type filter (empty set = show all rides+shows by default behavior handled by initial state)
    if (filters.entityTypes.size > 0) {
      if (!filters.entityTypes.has(a.entityType as EntityType)) return false;
    }

    // Tier 2: attraction sub-type filter
    if (filters.attractionTypes.size > 0) {
      // Shows always remain visible regardless of attraction sub-type filters
      if (a.entityType !== 'SHOW') {
        if (a.entityType !== 'ATTRACTION') return false;
        if (!a.attractionType || !filters.attractionTypes.has(a.attractionType)) return false;
      }
    }

    return true;
  });

  // Split into operating and not operating
  const operating = filteredAttractions
    .filter((a) => a.status === 'OPERATING')
    .sort((a, b) => {
      const aWait = a.waitMinutes;
      const bWait = b.waitMinutes;
      // If neither has wait times, sort alphabetically
      if (aWait === null && bWait === null) return a.name.localeCompare(b.name);
      // n/a always at bottom regardless of sort direction
      if (aWait === null) return 1;
      if (bWait === null) return -1;
      return sortAsc ? aWait - bWait : bWait - aWait;
    });
  const notOperating = filteredAttractions.filter((a) => a.status !== 'OPERATING').sort((a, b) => a.name.localeCompare(b.name));

  // Stats
  const operatingCount = operating.length;
  const operatingWithWaits = operating.filter((a) => a.waitMinutes !== null);
  const avgWait = operatingWithWaits.length > 0
    ? Math.round(operatingWithWaits.reduce((sum, a) => sum + (a.waitMinutes || 0), 0) / operatingWithWaits.length)
    : 0;
  const longestWait = operatingWithWaits.length > 0
    ? Math.max(...operatingWithWaits.map((a) => a.waitMinutes || 0))
    : 0;

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
        {/* Breadcrumb skeleton */}
        <div className="mb-6 h-4 w-32 animate-pulse rounded bg-primary-100" />
        {/* Header area */}
        <div className="mb-8">
          <div className="h-9 w-64 animate-pulse rounded bg-primary-100" />
          <div className="mt-3 h-5 w-48 animate-pulse rounded bg-primary-100" />
        </div>
        {/* Stats cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-primary-50" />
          ))}
        </div>
        {/* Filter chips placeholder */}
        <div className="mb-6 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-full bg-primary-100" style={{ width: `${60 + i * 12}px` }} />
          ))}
        </div>
        {/* Attraction list placeholders */}
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg bg-primary-50 p-4 animate-pulse">
              <div className="h-5 w-5 rounded bg-primary-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/5 rounded bg-primary-100" />
                <div className="h-3 w-1/4 rounded bg-primary-100" />
              </div>
              <div className="h-6 w-14 rounded-full bg-primary-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-primary-400">
        <Link href="/parks" className="hover:text-primary-600">Parks</Link>
        <span className="mx-2">›</span>
        <span className="text-primary-700">{park?.name || 'Park'}</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-primary-900">{park?.name}</h1>
            {schedule ? (
              <ParkOperatingStatus segments={schedule.segments} timezone={schedule.timezone} />
            ) : waitTimesLoading ? (
              <span className="inline-block h-6 w-16 animate-pulse rounded-full bg-primary-100" />
            ) : null}
          </div>
          {park && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-primary-500">
              {(() => {
                const loc = park.destinationId ? getLocationByDestinationId(park.destinationId) : undefined;
                return loc ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {formatLocation(loc)}
                  </span>
                ) : null;
              })()}
              {(() => {
                const family = DESTINATION_FAMILIES.find((f) =>
                  f.destinations.some((d) => d.parks.some((p) => p.id === park.id))
                );
                return family ? (
                  <span className="text-primary-400">
                    Part of {park.destinationName}
                    {family.familyName !== park.destinationName && ` · ${family.familyName}`}
                  </span>
                ) : null;
              })()}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="relative inline-flex items-center gap-2 rounded-lg bg-coral-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-coral-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Wait Times'}
            {isBackgroundRefreshing && (
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
              </span>
            )}
          </button>
          {refreshError && (
            <span className="text-xs text-red-600">{refreshError}</span>
          )}
          {dataFreshness && (
            <span className={`text-xs ${dataFreshness.isStale ? 'text-amber-600' : 'text-primary-400'}`}>
              {dataFreshness.label}
            </span>
          )}
          {waitTimesLoading && !refreshing && (
            <span className="text-xs text-primary-400 animate-pulse">Loading wait times…</span>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setQuickLogOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-coral-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-coral-600"
        >
          🎢 Log a Ride
        </button>
        <Link
          href="/trips/new"
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
        >
          ✈️ Start a Trip
        </Link>
        <Link
          href={`/calendar${(() => {
            const dest = DESTINATION_FAMILIES.flatMap((f) => f.destinations).find((d) => d.id === park?.destinationId);
            return dest ? `?family=${dest.slug.replace(/-dest$/, '')}` : '';
          })()}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
        >
          📅 Crowd Calendar
        </Link>
      </div>

      {/* Park Schedule Bar */}
      {schedule && schedule.segments.length > 0 ? (
        <div className="mb-8">
          <ParkScheduleBar segments={schedule.segments} timezone={schedule.timezone} />
        </div>
      ) : waitTimesLoading && !schedule ? (
        <div className="mb-8">
          <div className="h-10 w-full animate-pulse rounded-lg bg-primary-100" />
        </div>
      ) : null}

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-primary-100 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-primary-500">
            <TrendingUp className="h-4 w-4" />
            <span>Operating</span>
          </div>
          {waitTimesLoading ? (
            <div className="mt-2 h-7 w-20 animate-pulse rounded bg-primary-100" />
          ) : (
            <p className="mt-1 text-2xl font-bold text-primary-800">
              {operatingCount}
              <span className="ml-1 text-sm font-normal text-primary-400">/ {mergedAttractions.length}</span>
            </p>
          )}
        </div>
        <div className="rounded-xl border border-primary-100 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-primary-500">
            <Clock className="h-4 w-4" />
            <span>Avg Wait</span>
          </div>
          {waitTimesLoading ? (
            <div className="mt-2 h-7 w-16 animate-pulse rounded bg-primary-100" />
          ) : (
            <p className="mt-1 text-2xl font-bold text-primary-800">
              {operatingWithWaits.length > 0 ? avgWait : '—'}<span className="ml-1 text-sm font-normal text-primary-400">{operatingWithWaits.length > 0 ? 'min' : ''}</span>
            </p>
          )}
        </div>
        <div className="rounded-xl border border-primary-100 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-primary-500">
            <AlertCircle className="h-4 w-4" />
            <span>Longest Wait</span>
          </div>
          {waitTimesLoading ? (
            <div className="mt-2 h-7 w-16 animate-pulse rounded bg-primary-100" />
          ) : (
            <p className="mt-1 text-2xl font-bold text-amber-600">
              {operatingWithWaits.length > 0 ? longestWait : '—'}<span className="ml-1 text-sm font-normal text-primary-400">{operatingWithWaits.length > 0 ? 'min' : ''}</span>
            </p>
          )}
        </div>
      </div>

      {/* Filter Chips */}
      <AttractionFilterChips filters={filters} onChange={setFilters} availableTypes={availableAttractionTypes} />

      {/* If park is closed / after hours: show all attractions in one list */}
      {!waitTimesLoading && operating.length === 0 && filteredAttractions.length > 0 ? (
        <section className="mb-10">
          {/* Closed banner */}
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-800">
              🌙 This park is currently closed — wait times are not available.
            </p>
            <p className="mt-0.5 text-xs text-amber-600">
              Browse all {filteredAttractions.length} attractions below. Wait times update when the park opens.
            </p>
          </div>

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary-800">
              All Attractions ({filteredAttractions.length})
            </h2>
            <button
              onClick={() => setSortAsc(!sortAsc)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary-500 transition-colors hover:bg-primary-50 hover:text-primary-700"
            >
              <ArrowUpDown className="h-3 w-3" />
              {sortAsc ? 'Z→A' : 'A→Z'}
            </button>
          </div>
          <div className="divide-y divide-primary-50 rounded-xl border border-primary-100 bg-white">
            {[...filteredAttractions]
              .sort((a, b) => sortAsc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name))
              .map((a) => (
              <AttractionRow
                key={a.id}
                name={a.name}
                entityType={a.entityType}
                status={a.status}
                waitMinutes={null}
                queue={a.queue}
                onClick={() => setSelectedRide({ attractionId: a.id, name: a.name, entityType: a.entityType, status: a.status, waitMinutes: a.waitMinutes, queue: a.queue, forecast: a.forecast, forecastMeta: a.forecastMeta, operatingHours: a.operatingHours })}
              />
            ))}
          </div>
        </section>
      ) : (
        <>
          {/* Operating Attractions */}
          <section className="mb-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-primary-800">
                Operating ({operating.length})
              </h2>
              <button
                onClick={() => setSortAsc(!sortAsc)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary-500 transition-colors hover:bg-primary-50 hover:text-primary-700"
              >
                <ArrowUpDown className="h-3 w-3" />
                {sortAsc ? '↓ Longest first' : '↑ Shortest first'}
              </button>
            </div>
            <div className="divide-y divide-primary-50 rounded-xl border border-primary-100 bg-white">
              {operating.map((a) => (
                <AttractionRow
                  key={a.id}
                  name={a.name}
                  entityType={a.entityType}
                  status={a.status}
                  waitMinutes={a.waitMinutes}
                  queue={a.queue}
                  onClick={() => setSelectedRide({ attractionId: a.id, name: a.name, entityType: a.entityType, status: a.status, waitMinutes: a.waitMinutes, queue: a.queue, forecast: a.forecast, forecastMeta: a.forecastMeta, operatingHours: a.operatingHours })}
                />
              ))}
              {operating.length === 0 && (
                <p className="text-center text-sm text-primary-400 py-8">
                  No attractions currently operating.
                </p>
              )}
            </div>
          </section>

          {/* Closed / Not Operating */}
          {notOperating.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-primary-800">
                Closed / Not Operating ({notOperating.length})
              </h2>
              <div className="divide-y divide-primary-50 rounded-xl border border-primary-100 bg-white">
                {notOperating.map((a) => (
                  <AttractionRow
                    key={a.id}
                    name={a.name}
                    entityType={a.entityType}
                    status={a.status}
                    waitMinutes={a.waitMinutes}
                    queue={a.queue}
                    onClick={() => setSelectedRide({ attractionId: a.id, name: a.name, entityType: a.entityType, status: a.status, waitMinutes: a.waitMinutes, queue: a.queue, forecast: a.forecast, forecastMeta: a.forecastMeta, operatingHours: a.operatingHours })}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Ride Detail Panel */}
      {selectedRide && park && (
        <RideDetailPanel
          attractionId={selectedRide.attractionId}
          parkId={park.id}
          name={selectedRide.name}
          entityType={selectedRide.entityType}
          status={selectedRide.status}
          waitMinutes={selectedRide.waitMinutes}
          queue={selectedRide.queue}
          forecast={selectedRide.forecast}
          forecastMeta={selectedRide.forecastMeta}
          operatingHours={selectedRide.operatingHours}
          onClose={() => setSelectedRide(null)}
        />
      )}

      <UnifiedLogSheet
        open={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        initialParkId={park?.id}
        expandedByDefault={true}
      />
    </div>
  );
}
