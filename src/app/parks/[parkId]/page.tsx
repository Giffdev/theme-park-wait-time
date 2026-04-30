'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, ArrowUpDown, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import { getCollection, whereConstraint } from '@/lib/firebase/firestore';
import AttractionRow from '@/components/AttractionRow';
import AttractionFilterChips, {
  type FilterState,
  type EntityType,
} from '@/components/parks/AttractionFilterChips';
import RideDetailPanel from '@/components/parks/RideDetailPanel';
import ParkScheduleBar from '@/components/parks/ParkScheduleBar';
import ParkOperatingStatus from '@/components/parks/ParkOperatingStatus';
import type { AttractionType } from '@/types/attraction';
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
  const [refreshing, setRefreshing] = useState(false);
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

  const fetchData = useCallback(async () => {
    if (!parkId) return;
    try {
      // Look up park by slug field
      const parkDocs = await getCollection<Park>('parks', [whereConstraint('slug', '==', parkId)]);
      const parkDoc = parkDocs.length > 0 ? parkDocs[0] : null;
      setPark(parkDoc);

      if (!parkDoc) {
        setLoading(false);
        return null;
      }

      // Use the park's UUID for attraction and wait time queries
      const parkUuid = parkDoc.id;
      const [attractionDocs, waitDocs] = await Promise.all([
        getCollection<Attraction>('attractions', [whereConstraint('parkId', '==', parkUuid)]),
        getCollection<WaitTimeEntry>(`waitTimes/${parkUuid}/current`),
      ]);
      setAttractions(attractionDocs);
      setWaitTimes(waitDocs);

      // Fetch park schedule
      try {
        const scheduleRes = await fetch(`/api/park-schedule?parkId=${parkUuid}`);
        if (scheduleRes.ok) {
          const scheduleData = await scheduleRes.json();
          setSchedule(scheduleData);
        }
      } catch {
        // Schedule fetch is non-critical
      }

      return waitDocs;
    } catch (error) {
      console.error('Failed to fetch park data:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [parkId]);

  useEffect(() => {
    async function initLoad() {
      const waitDocs = await fetchData();
      // If Firestore data is missing forecast (stale from old script), trigger a background refresh
      if (waitDocs && waitDocs.length > 0) {
        const hasForecast = waitDocs.some((w) => w.forecast && w.forecast.length > 0);
        if (!hasForecast) {
          // Look up park UUID for API call
          try {
            const parkDocs = await getCollection<Park>('parks', [whereConstraint('slug', '==', parkId)]);
            if (parkDocs && parkDocs.length > 0) {
              await fetch(`/api/wait-times?parkId=${parkDocs[0].id}`);
              await fetchData();
            }
          } catch {
            // Non-critical: user can still manually refresh
          }
        }
      }
    }
    initLoad();
  }, [fetchData, parkId]);

  const handleRefresh = async () => {
    if (!park) return;
    setRefreshing(true);
    try {
      await fetch(`/api/wait-times?parkId=${park.id}`);
      await fetchData();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Merge wait times into attractions
  const waitMap = new Map(waitTimes.map((w) => [w.attractionId, w]));

  const mergedAttractions = attractions.map((a) => {
    const wt = waitMap.get(a.id);
    return {
      ...a,
      status: wt?.status || 'CLOSED',
      waitMinutes: wt?.waitMinutes ?? null,
      queue: wt?.queue ?? null,
      forecast: wt?.forecast ?? null,
      forecastMeta: wt?.forecastMeta ?? null,
      operatingHours: wt?.operatingHours ?? null,
    };
  });

  // Apply entity type + attraction type filters
  const filteredAttractions = mergedAttractions.filter((a) => {
    // Never show merchandise
    if (a.entityType === 'MERCHANDISE') return false;

    // Tier 1: entity type filter (empty set = show all rides+shows by default behavior handled by initial state)
    if (filters.entityTypes.size > 0) {
      if (!filters.entityTypes.has(a.entityType as EntityType)) return false;
    }

    // Tier 2: attraction sub-type filter (only applies to ATTRACTION entity type)
    if (filters.attractionTypes.size > 0 && a.entityType === 'ATTRACTION') {
      // If attractionType is null/undefined, still show it (don't filter out un-enriched records)
      if (a.attractionType && !filters.attractionTypes.has(a.attractionType)) return false;
    }

    return true;
  });

  // Split into operating and not operating
  const operating = filteredAttractions
    .filter((a) => a.status === 'OPERATING')
    .sort((a, b) => {
      const aWait = a.waitMinutes;
      const bWait = b.waitMinutes;
      // n/a always at bottom regardless of sort direction
      if (aWait === null && bWait === null) return 0;
      if (aWait === null) return 1;
      if (bWait === null) return -1;
      return sortAsc ? aWait - bWait : bWait - aWait;
    });
  const notOperating = filteredAttractions.filter((a) => a.status !== 'OPERATING');

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
        <div className="mb-6 h-4 w-32 animate-pulse rounded bg-primary-100" />
        <div className="mb-8">
          <div className="h-9 w-64 animate-pulse rounded bg-primary-100" />
          <div className="mt-3 h-5 w-48 animate-pulse rounded bg-primary-100" />
        </div>
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-primary-50" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-primary-50" />
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
            {schedule && (
              <ParkOperatingStatus segments={schedule.segments} timezone={schedule.timezone} />
            )}
          </div>
          <p className="mt-1 text-sm text-primary-500">{park?.destinationName}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-coral-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-coral-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Wait Times'}
          </button>
          {dataFreshness && (
            <span className={`text-xs ${dataFreshness.isStale ? 'text-amber-600' : 'text-primary-400'}`}>
              {dataFreshness.label}
            </span>
          )}
        </div>
      </div>

      {/* Park Schedule Bar */}
      {schedule && schedule.segments.length > 0 && (
        <div className="mb-8">
          <ParkScheduleBar segments={schedule.segments} timezone={schedule.timezone} />
        </div>
      )}

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-primary-100 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-primary-500">
            <TrendingUp className="h-4 w-4" />
            <span>Operating</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-primary-800">
            {operatingCount}
            <span className="ml-1 text-sm font-normal text-primary-400">/ {mergedAttractions.length}</span>
          </p>
        </div>
        <div className="rounded-xl border border-primary-100 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-primary-500">
            <Clock className="h-4 w-4" />
            <span>Avg Wait</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-primary-800">
            {operatingWithWaits.length > 0 ? avgWait : '—'}<span className="ml-1 text-sm font-normal text-primary-400">{operatingWithWaits.length > 0 ? 'min' : ''}</span>
          </p>
        </div>
        <div className="rounded-xl border border-primary-100 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-primary-500">
            <AlertCircle className="h-4 w-4" />
            <span>Longest Wait</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {operatingWithWaits.length > 0 ? longestWait : '—'}<span className="ml-1 text-sm font-normal text-primary-400">{operatingWithWaits.length > 0 ? 'min' : ''}</span>
          </p>
        </div>
      </div>

      {/* Filter Chips */}
      <AttractionFilterChips filters={filters} onChange={setFilters} />

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
    </div>
  );
}
