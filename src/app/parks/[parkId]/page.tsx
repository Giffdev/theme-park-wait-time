'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, ArrowUpDown, TrendingUp, Clock, AlertCircle, MapPin } from 'lucide-react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import UnifiedLogSheet from '@/components/UnifiedLogSheet';
import { getCollection, getDocument, whereConstraint } from '@/lib/firebase/firestore';
import { DESTINATION_FAMILIES, getParkBySlug } from '@/lib/parks/park-registry';
import { selectCurrentParkDocument } from '@/lib/parks/park-document-read';
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

const COLD_START_ATTEMPTS = 2;
const COLD_START_RETRY_DELAY_MS = 250;
const WAIT_TIMES_REQUEST_TIMEOUT_MS = 15_000;

function waitTimesFromApiPayload(payload: unknown, parkUuid: string): WaitTimeEntry[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const parks = (payload as { parks?: unknown }).parks;
  if (!parks || typeof parks !== 'object') return null;

  const entries = (parks as Record<string, unknown>)[parkUuid];
  if (!Array.isArray(entries)) return null;

  return entries.map((value) => {
    if (!value || typeof value !== 'object') {
      throw new Error('Server returned invalid wait-time data.');
    }

    const entry = value as Record<string, unknown>;
    if (
      typeof entry.attractionId !== 'string'
      || typeof entry.attractionName !== 'string'
      || typeof entry.status !== 'string'
      || (entry.waitMinutes !== null && typeof entry.waitMinutes !== 'number')
      || (entry.lastUpdated !== null && typeof entry.lastUpdated !== 'string')
      || typeof entry.fetchedAt !== 'string'
      || !Number.isFinite(Date.parse(entry.fetchedAt))
    ) {
      throw new Error('Server returned invalid wait-time data.');
    }

    return {
      ...entry,
      id: typeof entry.id === 'string' ? entry.id : entry.attractionId,
    } as unknown as WaitTimeEntry;
  });
}

interface ParkScheduleData {
  segments: ScheduleSegment[];
  timezone: string;
}

interface DataIssue {
  kind: 'permission' | 'network' | 'unknown';
  title: string;
  message: string;
}

/** Backward-compatible alias — wait-times issue is one instance of the shared DataIssue shape. */
type WaitTimesIssue = DataIssue;

/** Classify a caught error into permission/network/unknown so genuine backend
 * failures are never silently mistaken for missing or invented data. */
function classifyDataIssue(
  error: unknown,
  copy: Record<DataIssue['kind'], { title: string; message: string }>
): DataIssue {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (code.includes('permission-denied') || message.includes('permission')) {
    return { kind: 'permission', ...copy.permission };
  }

  if (code.includes('unavailable') || message.includes('network') || message.includes('offline')) {
    return { kind: 'network', ...copy.network };
  }

  return { kind: 'unknown', ...copy.unknown };
}

function describeWaitTimesError(error: unknown): WaitTimesIssue {
  return classifyDataIssue(error, {
    permission: {
      title: 'Wait times aren’t available yet',
      message: 'The app cannot read the current wait-time feed. Data access may still be getting configured.',
    },
    network: {
      title: 'Couldn’t reach the wait-time feed',
      message: 'Check your connection and retry. Attraction details are still available below.',
    },
    unknown: {
      title: 'Couldn’t load current wait times',
      message: 'The live feed may be temporarily unavailable. Retry in a moment.',
    },
  });
}

/** Attractions fail independently from the park document itself — a park that
 * loads fine can still have an unseeded or inaccessible attraction directory.
 * Classifying this separately from `coreError` avoids telling the user the
 * whole park is unavailable when only the attraction list failed. */
function describeAttractionsError(error: unknown): DataIssue {
  return classifyDataIssue(error, {
    permission: {
      title: 'Attraction directory isn’t available yet',
      message: 'The app cannot read this park’s attraction list. Data access may still be getting configured.',
    },
    network: {
      title: 'Couldn’t reach the attraction directory',
      message: 'Check your connection and retry. Park details above are still accurate.',
    },
    unknown: {
      title: 'Couldn’t load the attraction directory',
      message: 'This park may not be fully set up yet, or the directory is temporarily unavailable. Retry in a moment.',
    },
  });
}

/** The schedule call is supplemental metadata (park hours) and must never be
 * allowed to block wait-time rendering. It fails independently, with its own
 * bounded timeout and retryable state, distinct from `waitTimesIssue`. */
function describeScheduleError(error: unknown): DataIssue {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return {
      kind: 'network',
      title: 'Park hours are taking a while to load',
      message: 'The operating-hours feed didn’t respond in time. Wait times above are unaffected — retry to load hours.',
    };
  }
  return classifyDataIssue(error, {
    permission: {
      title: 'Park hours aren’t available yet',
      message: 'The app cannot read this park’s schedule. Data access may still be getting configured.',
    },
    network: {
      title: 'Couldn’t reach the park-hours feed',
      message: 'Check your connection and retry. Wait times above are unaffected.',
    },
    unknown: {
      title: 'Couldn’t load park hours',
      message: 'The schedule feed may be temporarily unavailable. Retry in a moment.',
    },
  });
}

export default function ParkDetailPage() {
  const { parkId } = useParams<{ parkId: string }>();
  const [park, setPark] = useState<Park | null>(null);
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [waitTimes, setWaitTimes] = useState<WaitTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [attractionsIssue, setAttractionsIssue] = useState<DataIssue | null>(null);
  const [attractionsLoading, setAttractionsLoading] = useState(false);
  const [waitTimesLoading, setWaitTimesLoading] = useState(true);
  const [waitTimesIssue, setWaitTimesIssue] = useState<WaitTimesIssue | null>(null);
  const [waitTimesSourceStale, setWaitTimesSourceStale] = useState(false);
  // Schedule (park hours) loads fully independently of wait times — its own
  // hang/failure must never block waitTimesLoading from settling or wait
  // times from rendering.
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleIssue, setScheduleIssue] = useState<DataIssue | null>(null);
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
  const activeRouteRef = useRef(parkId);
  const initializationRef = useRef({ route: '', generation: 0 });
  if (initializationRef.current.route !== parkId) {
    initializationRef.current = {
      route: parkId,
      generation: initializationRef.current.generation + 1,
    };
  }
  const refreshRequestsRef = useRef(new Map<string, {
    requestedRoute: string;
    initializationGeneration: number;
    requestVersion: number;
    promise: Promise<void>;
  }>());
  const waitTimesRequestVersionRef = useRef(0);
  const hasUsableWaitTimesRef = useRef(false);
  const initialWaitTimesErrorRef = useRef<unknown>(null);
  activeRouteRef.current = parkId;
  const isCurrentInitialization = useCallback((
    requestedRoute: string,
    initializationGeneration: number,
  ) => (
    activeRouteRef.current === requestedRoute
    && initializationRef.current.route === requestedRoute
    && initializationRef.current.generation === initializationGeneration
  ), []);

  // Tick every 30s so relative time stays fresh
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Derive capture and provider freshness from the metadata already stored per entry.
  const dataFreshness = useMemo(() => {
    if (waitTimes.length === 0) return null;
    const fetchedTimestamps = waitTimes
      .map((w) => w.fetchedAt)
      .filter(Boolean)
      .map((ts) => new Date(ts).getTime())
      .filter((t) => !isNaN(t));
    if (fetchedTimestamps.length === 0) return null;
    const capturedAt = Math.max(...fetchedTimestamps);
    const providerTimestamps = waitTimes
      .map((w) => w.lastUpdated)
      .filter((timestamp): timestamp is string => Boolean(timestamp))
      .map((timestamp) => new Date(timestamp).getTime())
      .filter((timestamp) => !isNaN(timestamp));
    const providerUpdatedAt = providerTimestamps.length > 0 ? Math.max(...providerTimestamps) : null;
    const ageMin = Math.max(0, Math.floor((now - capturedAt) / 60_000));
    const isStale = waitTimesSourceStale || ageMin >= 2;
    let label: string;
    if (ageMin < 1) {
      label = 'Captured just now';
    } else if (ageMin === 1) {
      label = 'Captured 1 min ago';
    } else if (ageMin < 60) {
      label = `Captured ${ageMin} min ago`;
    } else {
      label = `Captured at ${new Date(capturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    return {
      label,
      isStale,
      capturedAt,
      providerUpdatedAt,
    };
  }, [waitTimes, waitTimesSourceStale, now]);

  const scheduleStatus = useMemo<'open' | 'closed' | 'unknown'>(() => {
    if (!schedule?.segments?.length) return 'unknown';
    const activeOperatingSegment = schedule.segments.some((segment) => {
      if (segment.type !== 'OPERATING') return false;
      const openingTime = new Date(segment.openingTime).getTime();
      const closingTime = new Date(segment.closingTime).getTime();
      return openingTime <= now && now < closingTime;
    });
    return activeOperatingSegment ? 'open' : 'closed';
  }, [schedule, now]);

  // Phase 1: Load park info + attraction list (instant render)
  // Phase 1a: Resolve the park document only. Kept separate from attractions so
  // a park that exists but has an unseeded/inaccessible attraction directory
  // still renders as a found park instead of a blanket "unavailable" error.
  const fetchPark = useCallback(async (
    requestedRoute = parkId,
    initializationGeneration = initializationRef.current.generation,
  ) => {
    if (!parkId) return null;
    if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return null;
    setLoading(true);
    setCoreError(null);
    try {
      const registryPark = getParkBySlug(requestedRoute);
      let parkDoc = registryPark
        ? await getDocument<Park>('parks', registryPark.id)
        : null;
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return null;
      if (!parkDoc) {
        const parkDocs = await getCollection<Park>('parks', [
          whereConstraint('slug', '==', requestedRoute),
        ]);
        if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return null;
        parkDoc = selectCurrentParkDocument(parkDocs, requestedRoute) ?? null;
      }
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return null;
      setPark(parkDoc);
      setLoading(false);
      return parkDoc;
    } catch (error) {
      console.error('Failed to fetch park core data:', error);
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return null;
      setCoreError('We couldn’t load this park. Check your connection and try again.');
      setLoading(false);
      return null;
    }
  }, [isCurrentInitialization, parkId]);

  // Phase 1b: Load the attraction directory for a resolved park. Failures here
  // are classified independently — a genuine backend failure must never be
  // hidden or silently presented as an empty (invented) attraction list.
  const fetchAttractions = useCallback(async (
    parkUuid: string,
    requestedRoute = parkId,
    initializationGeneration = initializationRef.current.generation,
  ) => {
    if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return null;
    setAttractionsLoading(true);
    setAttractionsIssue(null);
    try {
      const attractionDocs = await getCollection<Attraction>('attractions', [whereConstraint('parkId', '==', parkUuid)]);
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return attractionDocs;
      setAttractions(attractionDocs);
      return attractionDocs;
    } catch (error) {
      console.error('Failed to fetch attractions:', error);
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return null;
      setAttractions([]);
      setAttractionsIssue(describeAttractionsError(error));
      return null;
    } finally {
      if (isCurrentInitialization(requestedRoute, initializationGeneration)) {
        setAttractionsLoading(false);
      }
    }
  }, [isCurrentInitialization, parkId]);

  // Phase 2: Load wait times only. This is intentionally decoupled from the
  // schedule fetch (see `fetchSchedule` below) — a hung or failed
  // `/api/park-schedule` call must never block this from resolving or
  // `waitTimesLoading` from settling.
  const fetchWaitTimes = useCallback(async (
    parkDoc?: Park | null,
    options?: {
      requestedRoute?: string;
      showLoading?: boolean;
      throwOnError?: boolean;
      reportError?: boolean;
      requestVersion?: number;
      initializationGeneration?: number;
    },
  ) => {
    const targetPark = parkDoc || park;
    if (!targetPark) return null;
    const requestedRoute = options?.requestedRoute ?? parkId;
    const showLoading = options?.showLoading ?? true;
    const initializationGeneration = options?.initializationGeneration
      ?? initializationRef.current.generation;
    if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return null;
    const requestVersion = options?.requestVersion ?? ++waitTimesRequestVersionRef.current;
    if (showLoading) setWaitTimesLoading(true);
    if (options?.reportError !== false) setWaitTimesIssue(null);
    try {
      const parkUuid = targetPark.id;
      const waitDocs = await getCollection<WaitTimeEntry>(`waitTimes/${parkUuid}/current`);
      if (
        !isCurrentInitialization(requestedRoute, initializationGeneration)
        || waitTimesRequestVersionRef.current !== requestVersion
      ) return waitDocs;
      setWaitTimes(waitDocs);
      hasUsableWaitTimesRef.current = waitDocs.length > 0;
      setWaitTimesSourceStale(false);
      return waitDocs;
    } catch (error) {
      console.error('Failed to fetch wait times:', error);
      if (
        !isCurrentInitialization(requestedRoute, initializationGeneration)
        || waitTimesRequestVersionRef.current !== requestVersion
      ) return null;
      if (options?.reportError === false) initialWaitTimesErrorRef.current = error;
      if (options?.reportError !== false) setWaitTimesIssue(describeWaitTimesError(error));
      if (options?.throwOnError) throw error;
      return null;
    } finally {
      if (
        showLoading
        && isCurrentInitialization(requestedRoute, initializationGeneration)
        && waitTimesRequestVersionRef.current === requestVersion
      ) {
        setWaitTimesLoading(false);
      }
    }
  }, [isCurrentInitialization, park, parkId]);

  // Schedule (park hours) is supplemental metadata fetched independently of
  // wait times, bounded by its own timeout so a backend hang can never
  // cascade into the wait-time UI. Last-known schedule is preserved on
  // failure; a distinct `scheduleIssue` drives a retryable UI state instead
  // of an indefinite loading skeleton.
  const fetchSchedule = useCallback(async (
    parkUuid: string,
    requestedRoute = parkId,
    initializationGeneration = initializationRef.current.generation,
  ) => {
    if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return null;
    setScheduleLoading(true);
    setScheduleIssue(null);
    try {
      const res = await fetch(`/api/park-schedule?parkId=${parkUuid}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return null;
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const scheduleData = await res.json();
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return scheduleData;
      setSchedule(scheduleData);
      return scheduleData;
    } catch (error) {
      console.error('Failed to fetch park schedule:', error);
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return null;
      setScheduleIssue(describeScheduleError(error));
      return null;
    } finally {
      if (isCurrentInitialization(requestedRoute, initializationGeneration)) {
        setScheduleLoading(false);
      }
    }
  }, [isCurrentInitialization, parkId]);

  const refreshWaitTimesFromSource = useCallback((
    targetPark: Park,
    requestedRoute = parkId,
    initializationGeneration = initializationRef.current.generation,
  ) => {
    if (!isCurrentInitialization(requestedRoute, initializationGeneration)) {
      return Promise.resolve();
    }
    const existing = refreshRequestsRef.current.get(targetPark.id);
    if (
      existing
      && existing.requestedRoute === requestedRoute
      && existing.initializationGeneration === initializationGeneration
      && existing.requestVersion === waitTimesRequestVersionRef.current
    ) return existing.promise;
    if (!isCurrentInitialization(requestedRoute, initializationGeneration)) {
      return Promise.resolve();
    }
    const requestVersion = ++waitTimesRequestVersionRef.current;

    const refreshPromise: Promise<void> = (async () => {
      const res = await fetch(`/api/wait-times?parkId=${targetPark.id}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(WAIT_TIMES_REQUEST_TIMEOUT_MS),
      });
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const payload = await res.json();
      if (
        !isCurrentInitialization(requestedRoute, initializationGeneration)
        || waitTimesRequestVersionRef.current !== requestVersion
      ) return;

      const upstreamWaitTimes = waitTimesFromApiPayload(payload, targetPark.id);
      if (upstreamWaitTimes !== null) {
        if (upstreamWaitTimes.length === 0) {
          throw new Error('Server returned no usable wait-time snapshot.');
        }
        setWaitTimes(upstreamWaitTimes);
        hasUsableWaitTimesRef.current = upstreamWaitTimes.length > 0;
        const responseMeta = (payload as {
          stale?: unknown;
          parkMeta?: Record<string, { stale?: unknown }>;
        });
        setWaitTimesSourceStale(
          responseMeta.stale === true || responseMeta.parkMeta?.[targetPark.id]?.stale === true
        );
        setWaitTimesIssue(null);
        setWaitTimesLoading(false);
        return;
      }

      // Backward-compatible fallback for an older API response that did not
      // include park entries. Current responses are applied directly because
      // persistence is intentionally deferred and may not be readable yet.
      const persistedEntries = await fetchWaitTimes(targetPark, {
        requestedRoute,
        showLoading: false,
        throwOnError: true,
        requestVersion,
        initializationGeneration,
      });
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
      if (!persistedEntries || persistedEntries.length === 0) {
        throw new Error('Server returned no usable wait-time snapshot.');
      }
    })().finally(() => {
      if (refreshRequestsRef.current.get(targetPark.id)?.promise === refreshPromise) {
        refreshRequestsRef.current.delete(targetPark.id);
      }
    });

    refreshRequestsRef.current.set(targetPark.id, {
      requestedRoute,
      initializationGeneration,
      requestVersion,
      promise: refreshPromise,
    });
    return refreshPromise;
  }, [fetchWaitTimes, isCurrentInitialization, parkId]);

  const refreshColdStartWithRetry = useCallback(async (
    targetPark: Park,
    requestedRoute: string,
    initializationGeneration: number,
  ) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= COLD_START_ATTEMPTS; attempt++) {
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
      try {
        await refreshWaitTimesFromSource(
          targetPark,
          requestedRoute,
          initializationGeneration,
        );
        if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
        return;
      } catch (error) {
        if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
        lastError = error;
        if (attempt < COLD_START_ATTEMPTS) {
          if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
          await new Promise((resolve) => setTimeout(resolve, COLD_START_RETRY_DELAY_MS));
          if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
        }
      }
    }
    throw lastError;
  }, [isCurrentInitialization, refreshWaitTimesFromSource]);

  useEffect(() => {
    const requestedRoute = parkId;
    const initializationGeneration = initializationRef.current.generation;

    async function initLoad() {
      // Phase 1a: resolve the park doc itself
      const parkDoc = await fetchPark(requestedRoute, initializationGeneration);
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
      if (!parkDoc) return;

      // Schedule is fired independently (not awaited alongside attractions/wait
      // times) — a hung or slow `/api/park-schedule` response must never delay
      // or block wait-time rendering.
      void fetchSchedule(parkDoc.id, requestedRoute, initializationGeneration);

      // Phase 1b + Phase 2: attractions and wait times load independently so a
      // failure in one never masks or blocks the other.
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
      const initialRequestVersion = ++waitTimesRequestVersionRef.current;
      void fetchAttractions(parkDoc.id, requestedRoute, initializationGeneration);
      const waitDocs = await fetchWaitTimes(parkDoc, {
        requestedRoute,
        showLoading: false,
        reportError: false,
        requestVersion: initialRequestVersion,
        initializationGeneration,
      });

      if (
        !isCurrentInitialization(requestedRoute, initializationGeneration)
        || waitTimesRequestVersionRef.current !== initialRequestVersion
      ) return;

      if (!waitDocs || waitDocs.length === 0) {
        try {
          await refreshColdStartWithRetry(
            parkDoc,
            requestedRoute,
            initializationGeneration,
          );
          if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
        } catch (error) {
          if (
            isCurrentInitialization(requestedRoute, initializationGeneration)
            && !hasUsableWaitTimesRef.current
          ) {
            setWaitTimesIssue(describeWaitTimesError(initialWaitTimesErrorRef.current ?? error));
          }
        }
      }

      if (isCurrentInitialization(requestedRoute, initializationGeneration)) {
        setWaitTimesLoading(false);
      }

      // Phase 3: background forecast refresh (fire-and-forget, never blocks UI)
      if (isCurrentInitialization(requestedRoute, initializationGeneration)
          && waitDocs && waitDocs.length > 0) {
        const hasForecast = waitDocs.some((w) => w.forecast && w.forecast.length > 0);
        if (!hasForecast) {
          refreshWaitTimesFromSource(
            parkDoc,
            requestedRoute,
            initializationGeneration,
          ).catch(() => { /* Non-critical */ });
        }
      }
    }

    if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
    setPark(null);
    setAttractions([]);
    setWaitTimes([]);
    hasUsableWaitTimesRef.current = false;
    initialWaitTimesErrorRef.current = null;
    setLoading(true);
    setCoreError(null);
    setAttractionsIssue(null);
    setAttractionsLoading(false);
    setWaitTimesLoading(true);
    setWaitTimesIssue(null);
    setWaitTimesSourceStale(false);
    setSchedule(null);
    setScheduleLoading(true);
    setScheduleIssue(null);
    setRefreshing(false);
    setRefreshError(null);
    initLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkId]);

  const isCurrentPark = park?.slug === parkId;

  // Auto-refresh wait times from the upstream source on arrival (if the
  // cached snapshot is stale) and when the user returns after 2+ minutes.
  const {
    isBackgroundRefreshing,
    lastRefreshError: waitTimesRefreshError,
    forceRefresh: forceWaitTimesRefresh,
  } = useAutoRefresh({
    key: `park-wait-times-${parkId}`,
    staleness: 2 * 60 * 1000,
    onRefresh: async () => {
      if (!park || !isCurrentPark) return;
      await refreshWaitTimesFromSource(park, parkId);
    },
    enabled: Boolean(park && isCurrentPark && !refreshing),
    initialDataAge: waitTimesLoading
      ? null
      : dataFreshness
        ? Date.now() - dataFreshness.capturedAt
        : undefined,
  });

  // Auto-refresh schedule when user returns after 30+ minutes. Shares the
  // same bounded/independent fetchSchedule used on initial arrival so a
  // hang never blocks this either.
  useAutoRefresh({
    key: `park-schedule-${parkId}`,
    staleness: 30 * 60 * 1000,
    onRefresh: async () => {
      if (!park || !isCurrentPark) return;
      await fetchSchedule(park.id, parkId);
    },
    enabled: Boolean(park && isCurrentPark && !refreshing),
  });

  const handleRefresh = async () => {
    if (!park || !isCurrentPark) return;
    const requestedRoute = parkId;
    const initializationGeneration = initializationRef.current.generation;
    if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await forceWaitTimesRefresh();
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
    } catch (error) {
      console.error('Refresh failed:', error);
      if (!isCurrentInitialization(requestedRoute, initializationGeneration)) return;
      const message =
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'Refresh timed out — try again later.'
          : error instanceof Error && error.message.includes('503')
            ? 'The upstream wait-time provider is temporarily unavailable. Existing times may be out of date.'
            : 'Refresh failed — please try again.';
      setRefreshError(message);
    } finally {
      if (isCurrentInitialization(requestedRoute, initializationGeneration)) {
        setRefreshing(false);
      }
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
        status: wt?.status || 'UNKNOWN',
        waitMinutes: wt?.waitMinutes ?? null,
        queue: wt?.queue ?? null,
        forecast: wt?.forecast ?? null,
        forecastMeta: wt?.forecastMeta ?? null,
        operatingHours: wt?.operatingHours ?? null,
      };
    });
  }, [attractions, waitMap]);

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
  const unknownStatus = notOperating.filter((a) => a.status === 'UNKNOWN');
  const confirmedNotOperating = notOperating.filter((a) => a.status !== 'UNKNOWN');

  // Stats
  const operatingCount = operating.length;
  const operatingWithWaits = operating.filter((a) => a.waitMinutes !== null);
  const avgWait = operatingWithWaits.length > 0
    ? Math.round(operatingWithWaits.reduce((sum, a) => sum + (a.waitMinutes || 0), 0) / operatingWithWaits.length)
    : 0;
  const longestWait = operatingWithWaits.length > 0
    ? Math.max(...operatingWithWaits.map((a) => a.waitMinutes || 0))
    : 0;

  if (loading || (park !== null && !isCurrentPark)) {
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

  if (coreError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-6 text-sm text-primary-400">
          <Link href="/parks" className="hover:text-primary-600">Parks</Link>
          <span className="mx-2">›</span>
          <span className="text-primary-600">Unavailable</span>
        </nav>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6" role="alert">
          <h1 className="text-xl font-bold text-primary-900">Park details unavailable</h1>
          <p className="mt-2 text-sm text-red-700">{coreError}</p>
          <button
            type="button"
            onClick={() => fetchPark()}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-coral-500 px-4 py-2 text-sm font-medium text-white hover:bg-coral-600"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!park) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-primary-200 bg-white p-6">
          <h1 className="text-xl font-bold text-primary-900">Park not found</h1>
          <p className="mt-2 text-sm text-primary-500">This park may no longer be in the supported park directory.</p>
          <Link href="/parks" className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-indigo-600">
            Browse supported parks →
          </Link>
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
            ) : scheduleLoading ? (
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
        <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="relative inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-coral-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-coral-600 disabled:opacity-50"
            aria-describedby="wait-time-feed-status"
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
            <span className="text-xs text-red-600" role="alert">{refreshError}</span>
          )}
          {dataFreshness && (
            <span
              className={`text-xs ${dataFreshness.isStale ? 'font-medium text-amber-700' : 'text-primary-400'}`}
              title={`Snapshot captured ${new Date(dataFreshness.capturedAt).toLocaleString()}${
                dataFreshness.providerUpdatedAt
                  ? `; provider last updated ${new Date(dataFreshness.providerUpdatedAt).toLocaleString()}`
                  : ''
              }`}
            >
              {dataFreshness.isStale ? 'Stale snapshot · ' : 'Wait-time feed · '}
              {dataFreshness.label}
            </span>
          )}
          {waitTimesLoading && !refreshing && (
            <span className="animate-pulse text-xs text-primary-400" role="status">Loading wait times…</span>
          )}
          {isBackgroundRefreshing && !refreshing && (
            <span className="animate-pulse text-xs text-primary-500" role="status">
              Refreshing wait times…
            </span>
          )}
          {!refreshError && waitTimesRefreshError != null && (
            <span className="text-xs text-amber-600">Background refresh failed — showing the last known snapshot.</span>
          )}
        </div>
      </div>

      <div id="wait-time-feed-status" className="sr-only" aria-live="polite" aria-atomic="true">
        {refreshing
          ? 'Refreshing wait times'
          : isBackgroundRefreshing
            ? 'Refreshing wait times in the background'
            : waitTimesLoading
            ? 'Loading wait times'
            : waitTimesIssue
              ? waitTimesIssue.title
              : dataFreshness?.isStale
                ? `Showing a stale snapshot. ${dataFreshness.label}.`
                : dataFreshness?.label || 'Wait-time status unavailable'}
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
      ) : scheduleLoading && !schedule ? (
        <div className="mb-8">
          <div className="h-10 w-full animate-pulse rounded-lg bg-primary-100" role="status" aria-label="Loading park hours">
            <span className="sr-only">Loading park hours…</span>
          </div>
        </div>
      ) : scheduleIssue ? (
        <div className="mb-8 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          <span>{scheduleIssue.title} — wait times below are unaffected.</span>
          <button
            type="button"
            onClick={() => park && fetchSchedule(park.id)}
            className="shrink-0 rounded-md border border-amber-300 px-2 py-1 text-xs font-medium hover:bg-amber-100"
          >
            Retry
          </button>
        </div>
      ) : null}

      {waitTimesIssue && (
        <div
          className={`mb-6 rounded-xl border px-4 py-4 ${
            waitTimes.length > 0
              ? 'border-amber-200 bg-amber-50'
              : 'border-red-200 bg-red-50'
          }`}
          role={waitTimes.length > 0 ? 'status' : 'alert'}
        >
          <p className={`text-sm font-semibold ${waitTimes.length > 0 ? 'text-amber-800' : 'text-red-800'}`}>
            {waitTimes.length > 0 ? 'Couldn’t update wait times' : waitTimesIssue.title}
          </p>
          <p className={`mt-1 text-sm ${waitTimes.length > 0 ? 'text-amber-700' : 'text-red-700'}`}>
            {waitTimes.length > 0
              ? `Showing the last snapshot instead. ${waitTimesIssue.message}`
              : waitTimesIssue.message}
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-current px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {refreshing ? 'Retrying…' : 'Retry wait times'}
          </button>
        </div>
      )}

      {!waitTimesLoading && !waitTimesIssue && waitTimes.length === 0 && (
        <div
          className={`mb-6 rounded-xl border px-4 py-4 ${
            scheduleStatus === 'closed'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-primary-200 bg-primary-50 text-primary-700'
          }`}
          role="status"
        >
          <p className="text-sm font-semibold">
            {scheduleStatus === 'closed'
              ? 'The park is currently closed'
              : 'No current wait-time snapshot is available'}
          </p>
          <p className="mt-1 text-sm opacity-80">
            {scheduleStatus === 'closed'
              ? 'Browse attractions below and check again near park opening.'
              : 'We won’t label missing waits as live. Retry the feed or browse the attraction directory below.'}
          </p>
        </div>
      )}

      {attractionsIssue && (
        <div
          className={`mb-6 rounded-xl border px-4 py-4 ${
            attractions.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'
          }`}
          role={attractions.length > 0 ? 'status' : 'alert'}
        >
          <p className={`text-sm font-semibold ${attractions.length > 0 ? 'text-amber-800' : 'text-red-800'}`}>
            {attractionsIssue.title}
          </p>
          <p className={`mt-1 text-sm ${attractions.length > 0 ? 'text-amber-700' : 'text-red-700'}`}>
            {attractionsIssue.message}
          </p>
          <button
            type="button"
            onClick={() => park && fetchAttractions(park.id)}
            disabled={attractionsLoading}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-current px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {attractionsLoading ? 'Retrying…' : 'Retry attraction list'}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-primary-100 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-primary-500">
            <TrendingUp className="h-4 w-4" />
            <span>Operating</span>
          </div>
          {waitTimesLoading && waitTimes.length === 0 ? (
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
          {waitTimesLoading && waitTimes.length === 0 ? (
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
          {waitTimesLoading && waitTimes.length === 0 ? (
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

      {/* Until a snapshot is available, keep attraction discovery useful without inventing statuses. */}
      {waitTimes.length === 0 ? (
        <section className="mb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary-800">
              Attractions ({filteredAttractions.length})
            </h2>
            {waitTimesLoading && (
              <span className="text-xs text-primary-400" role="status">Checking live status…</span>
            )}
          </div>
          <div className="divide-y divide-primary-50 rounded-xl border border-primary-100 bg-white">
            {[...filteredAttractions]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((a) => (
              <AttractionRow
                key={a.id}
                name={a.name}
                entityType={a.entityType}
                status="UNKNOWN"
                waitMinutes={null}
                queue={a.queue}
                loading={waitTimesLoading}
                onClick={() => setSelectedRide({ attractionId: a.id, name: a.name, entityType: a.entityType, status: a.status, waitMinutes: a.waitMinutes, queue: a.queue, forecast: a.forecast, forecastMeta: a.forecastMeta, operatingHours: a.operatingHours })}
              />
            ))}
            {filteredAttractions.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-primary-400">
                No attractions match the selected filters.
              </p>
            )}
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
                  loading={waitTimesLoading}
                  onClick={() => setSelectedRide({ attractionId: a.id, name: a.name, entityType: a.entityType, status: a.status, waitMinutes: a.waitMinutes, queue: a.queue, forecast: a.forecast, forecastMeta: a.forecastMeta, operatingHours: a.operatingHours })}
                />
              ))}
              {operating.length === 0 && (
                <p className="text-center text-sm text-primary-400 py-8">
                  {scheduleStatus === 'closed'
                    ? 'The park is outside its scheduled operating hours.'
                    : 'No attractions are currently reporting as operating.'}
                </p>
              )}
            </div>
          </section>

          {unknownStatus.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-3 text-lg font-semibold text-primary-800">
                Wait Unavailable ({unknownStatus.length})
              </h2>
              <p className="-mt-2 mb-3 text-xs text-primary-500">
                These attractions were not included in the latest snapshot, so their status is unknown.
              </p>
              <div className="divide-y divide-primary-50 rounded-xl border border-primary-100 bg-white">
                {unknownStatus.map((a) => (
                  <AttractionRow
                    key={a.id}
                    name={a.name}
                    entityType={a.entityType}
                    status={a.status}
                    waitMinutes={null}
                    queue={a.queue}
                    loading={waitTimesLoading}
                    onClick={() => setSelectedRide({ attractionId: a.id, name: a.name, entityType: a.entityType, status: a.status, waitMinutes: a.waitMinutes, queue: a.queue, forecast: a.forecast, forecastMeta: a.forecastMeta, operatingHours: a.operatingHours })}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Closed / Not Operating */}
          {confirmedNotOperating.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-primary-800">
                Closed / Not Operating ({confirmedNotOperating.length})
              </h2>
              <div className="divide-y divide-primary-50 rounded-xl border border-primary-100 bg-white">
                {confirmedNotOperating.map((a) => (
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
