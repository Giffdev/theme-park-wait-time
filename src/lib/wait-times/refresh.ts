import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { after } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { updateForecastAggregates } from '@/lib/forecast/aggregation';
import { resolveForecast } from '@/lib/forecast/blender';
import { getParkById, getParkLiveDataIds } from '@/lib/parks/park-registry';
import type { ForecastAggregate, ForecastMeta } from '@/types/queue';

const API_BASE = 'https://api.themeparks.wiki/v1';
const UPSTREAM_TIMEOUT_MS = 10_000;
const BATCH_SIZE = 499;
const CHILD_MEMBERSHIP_TTL_MS = 6 * 60 * 60 * 1000;

// Read-first single-doc Firestore cache: a park is considered "fresh enough
// to skip upstream entirely" within this window. Deliberately short relative
// to the frontend's own 2-minute arrival-refresh staleness threshold — this
// exists to collapse bursts of near-simultaneous requests (across separate
// serverless instances, where in-memory coalescing can't help), not to be
// the primary staleness signal users see.
const CACHE_READ_TTL_MS = 45_000;

// Per-stage deadlines. Kept well under `maxDuration` (30s) and, for the
// cache-read/blend stages specifically, kept quite tight: these reads are
// bounded, best-effort accelerants (see `preferRest: true` in
// src/lib/firebase/admin.ts for the cold-start-latency mitigation that keeps
// them realistic in practice) and must never become a new source of the
// hangs/504s this architecture exists to prevent. A slow or hung read is
// treated exactly like a cache miss and degrades to the next stage.
const CACHE_READ_TIMEOUT_MS = 300;
const BLEND_TIMEOUT_MS = 500;
const FALLBACK_CACHE_TIMEOUT_MS = 3_000;

// Bounds background maintenance (historical archive +, on the cron path
// only, forecast aggregation) so a slow/hung run can never hold the
// per-instance `maintenanceInFlight` guard indefinitely. Root-cause evidence
// (production): Universal-family parks (Islands of Adventure, Universal
// Studios Florida, Epic Universe) have zero live-provided forecasts for any
// attraction, so *every* entry needed a forecastAggregates lookup/update —
// `updateForecastAggregates` does a full collection read plus one
// individual `.get()` per attraction with valid history, fully unbounded.
// Combined with these being the highest-traffic parks in the app (frequent
// overlapping requests), maintenance for these parks routinely took far
// longer than for parks with fewer aggregation-eligible attractions, and a
// still-running maintenance chain from an earlier request was observed to
// starve a later request's own `writeCurrentWaitTimes` commit of Firestore
// client resources — exactly the failure mode already anticipated in the
// `maintenanceInFlight` guard's comment, just more severe for these parks.
// Forecast aggregation is therefore no longer run on the interactive
// request path at all (see `runMaintenance` below) — only the lighter
// historical-snapshot archive runs there, and it is hard-timeboxed.
const MAINTENANCE_DEADLINE_MS = 8_000;

// Firestore documents are capped at 1 MiB. Stay well under that for the
// single-doc per-park cache so a large park's payload never risks a failed
// write; if a payload would exceed this guard, the single-doc cache is
// skipped for that write (logged) while the existing per-attraction
// documents are still written normally (no regression).
const MAX_CACHE_DOC_BYTES = 900_000;

interface QueuePrice {
  amount: number;
  currency: string;
  formatted: string;
}

interface ReturnTimeQueue {
  state: 'AVAILABLE' | 'TEMPORARILY_FULL' | 'FINISHED' | string;
  returnStart: string | null;
  returnEnd: string | null;
}

interface PaidReturnTimeQueue extends ReturnTimeQueue {
  price: QueuePrice | null;
}

interface BoardingGroupQueue {
  state: 'AVAILABLE' | 'PAUSED' | 'CLOSED' | string;
  currentGroupStart: number | null;
  currentGroupEnd: number | null;
  estimatedWait: number | null;
}

interface LiveEntryQueue {
  STANDBY?: { waitTime: number | null };
  RETURN_TIME?: ReturnTimeQueue;
  PAID_RETURN_TIME?: PaidReturnTimeQueue;
  BOARDING_GROUP?: BoardingGroupQueue;
}

interface ForecastEntry {
  time: string;
  waitTime: number;
  percentage: number;
}

interface OperatingHoursEntry {
  type: string;
  startTime: string;
  endTime: string;
}

interface LiveEntry {
  id: string;
  name: string;
  entityType: string;
  status?: string;
  queue?: LiveEntryQueue;
  forecast?: ForecastEntry[];
  operatingHours?: OperatingHoursEntry[];
  lastUpdated?: string;
}

type FormattedWaitTimeEntry = Record<string, unknown> & {
  attractionId: string;
  attractionName: string;
  fetchedAt: string;
};

interface CachedParkData {
  liveData: LiveEntry[];
  fetchedAt: string;
}

interface LiveDataResult extends CachedParkData {
  stale: boolean;
  source: 'upstream' | 'memory-cache';
}

export interface ParkResponseMeta {
  stale: boolean;
  source: 'upstream' | 'memory-cache' | 'firestore-cache';
  fetchedAt: string;
  ageSeconds: number;
}

export interface ParkRefreshTiming {
  cacheReadMs?: number;
  upstreamMs?: number;
  blendMs?: number;
  totalMs: number;
}

export interface ParkRefreshResult {
  entries: FormattedWaitTimeEntry[];
  meta: ParkResponseMeta;
  // Internal-only stage timings for Server-Timing/telemetry. Never part of
  // the public JSON response contract (route.ts reads this to build a
  // response header; it is not serialized into the JSON body).
  timing?: ParkRefreshTiming;
}

export interface ConfiguredParkIds {
  supported: string[];
  unsupported: string[];
}

export interface RefreshManyResult {
  parkId: string;
  status: 'fresh' | 'stale' | 'failed';
  source?: ParkResponseMeta['source'];
  fetchedAt?: string;
  error?: string;
}

export class UpstreamFetchError extends Error {}
export class UnsupportedParkError extends Error {}

// Raised when a bounded fan-out abandons *waiting* on a single park because
// the caller's overall deadline elapsed. Distinct from UpstreamFetchError so
// callers can report "we ran out of response budget" honestly instead of
// blaming the upstream provider.
export class RefreshDeadlineError extends Error {}

const parkDataCache: Record<string, CachedParkData> = {};
const childMembershipCache: Record<string, { ids: Set<string>; fetchedAt: number }> = {};

// In-flight refreshPark promises, keyed by parkId *and refresh mode*.
// Concurrent requests for the same park in the same mode (e.g. multiple
// browser tabs/users hitting the arrival-refresh path at once) reuse the same
// upstream fetch + Firestore write instead of each firing an independent
// chain.
//
// The mode is part of the key on purpose. A forced refresh
// (`awaitMaintenance: true`, i.e. the cron path) deliberately skips the
// read-first Firestore cache and awaits persistence + maintenance; a public
// request does neither. Keying on parkId alone meant a cron run that landed
// while any public request for the same park was in flight silently adopted
// that public request's promise — so the scheduled refresh returned a cached
// read, performed no upstream fetch, and ran no maintenance, while still
// reporting success. The daily guarantee the cron exists to provide was
// defeated by ordinary traffic.
const inFlightRefreshes: Record<string, Promise<ParkRefreshResult>> = {};

// Refresh-mode discriminator for the in-flight coalescing key. Forced
// (maintenance-awaiting) refreshes and public read-path refreshes are never
// interchangeable and therefore never share a key.
function refreshCoalescingKey(parkId: string, options: { awaitMaintenance?: boolean }): string {
  return options.awaitMaintenance ? `forced:${parkId}` : `public:${parkId}`;
}

// Guards against overlapping background maintenance (historical archive +
// forecast aggregation) for the same park. Maintenance is fire-and-forget and
// can still be running when a subsequent request for the same park comes in;
// without this guard, each request kicks off its own maintenance chain and
// the resulting pile of concurrent Firestore reads/writes was observed to
// starve the primary writeCurrentWaitTimes commit for tens of seconds to
// multiple minutes.
const maintenanceInFlight: Record<string, Promise<void> | undefined> = {};

function responseMeta(
  source: ParkResponseMeta['source'],
  fetchedAt: string,
  stale: boolean
): ParkResponseMeta {
  return {
    stale,
    source,
    fetchedAt,
    ageSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(fetchedAt)) / 1000)),
  };
}

// Races `promise` against a timer that resolves `null`. Never rejects on
// timeout (a slow/hung read degrades to "treat as unavailable", matching how
// every caller already handles a genuine cache miss). Does not cancel the
// underlying operation — the Admin SDK doesn't expose that for Firestore
// reads — it only stops *waiting* on it.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Rejecting counterpart to `withTimeout`, for callers that must distinguish
// "this stage ran out of budget" from "this stage found nothing". Like
// `withTimeout` it only stops waiting; the underlying work is not cancelled.
export function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RefreshDeadlineError(`Refresh deadline of ${ms}ms exceeded`)),
      ms
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}

function logRequestTelemetry(parkId: string, fields: Record<string, unknown>) {
  // Single bounded, structured, secret-free line per request stage summary.
  // Never includes error text, headers, or env values — numbers/labels only.
  console.log(JSON.stringify({ scope: 'wait-times-refresh', parkId, ...fields }));
}

function parkCacheDocRef(parkId: string) {
  return adminDb.collection('waitTimes').doc(parkId);
}

interface ParkCacheDocData {
  entries: FormattedWaitTimeEntry[];
  fetchedAt: string;
}

// Builds the payload for the single bounded cache document per park. Returns
// null (and logs) if the payload would exceed the 1 MiB Firestore document
// limit guard — callers must still write the existing per-attraction docs in
// that case so there's no regression, just a skipped fast-path.
function buildCacheDocPayload(
  entries: FormattedWaitTimeEntry[],
  fetchedAt: string
): ParkCacheDocData | null {
  const payload: ParkCacheDocData = { entries, fetchedAt };
  const approxBytes = Buffer.byteLength(JSON.stringify(payload), 'utf-8');
  if (approxBytes > MAX_CACHE_DOC_BYTES) {
    console.warn(
      `Skipping single-doc wait-time cache for oversized payload (${approxBytes} bytes > ${MAX_CACHE_DOC_BYTES}); per-attraction docs are still written.`
    );
    return null;
  }
  return payload;
}

async function readParkCacheDoc(parkId: string): Promise<ParkCacheDocData | null> {
  const [snapshot] = await adminDb.getAll(parkCacheDocRef(parkId));
  if (!snapshot || !snapshot.exists) return null;
  const data = snapshot.data() as { entries?: unknown; fetchedAt?: unknown } | undefined;
  if (!data || !Array.isArray(data.entries) || typeof data.fetchedAt !== 'string') return null;
  const entries = data.entries.filter(isFormattedWaitTimeEntry);
  if (entries.length === 0) return null;
  return { entries, fetchedAt: data.fetchedAt };
}

// Bounded, best-effort read-first check. Never throws — any failure or
// timeout is treated identically to a cache miss so callers can fall through
// to the normal upstream-fetch path without special-casing errors.
async function readFreshParkCache(parkId: string): Promise<ParkCacheDocData | null> {
  try {
    return await withTimeout(readParkCacheDoc(parkId), CACHE_READ_TIMEOUT_MS);
  } catch (error) {
    console.warn(`Wait-time single-doc cache read failed for park ${parkId}:`, error);
    return null;
  }
}

function validLiveEntries(payload: unknown): LiveEntry[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { liveData?: unknown }).liveData)
  ) {
    throw new UpstreamFetchError('ThemeParks API returned an invalid liveData payload');
  }

  const rawEntries = (payload as { liveData: unknown[] }).liveData;
  const liveData = rawEntries.filter(
    (entry): entry is LiveEntry =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as LiveEntry).id === 'string' &&
      (entry as LiveEntry).id.length > 0 &&
      !(entry as LiveEntry).id.includes('/') &&
      typeof (entry as LiveEntry).name === 'string'
  );

  if (rawEntries.length > 0 && liveData.length === 0) {
    throw new UpstreamFetchError('ThemeParks API returned no valid live entries');
  }
  if (liveData.length !== rawEntries.length) {
    console.warn(
      `ThemeParks API returned ${rawEntries.length - liveData.length} malformed live entries`
    );
  }

  return liveData;
}

async function fetchCanonicalChildIds(parkId: string): Promise<Set<string>> {
  const cached = childMembershipCache[parkId];
  if (cached && Date.now() - cached.fetchedAt < CHILD_MEMBERSHIP_TTL_MS) {
    return cached.ids;
  }

  const res = await fetch(`${API_BASE}/entity/${parkId}/children`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new UpstreamFetchError(`ThemeParks children API error ${res.status}`);
  }
  const payload = await res.json() as { children?: unknown };
  if (!Array.isArray(payload.children)) {
    throw new UpstreamFetchError('ThemeParks API returned an invalid children payload');
  }
  const ids = new Set(
    payload.children
      .filter(
        (entry): entry is { id: string } =>
          !!entry &&
          typeof entry === 'object' &&
          typeof (entry as { id?: unknown }).id === 'string'
      )
      .map((entry) => entry.id)
  );
  childMembershipCache[parkId] = { ids, fetchedAt: Date.now() };
  return ids;
}

async function fetchLiveDataForPark(parkId: string): Promise<LiveDataResult> {
  try {
    const park = getParkById(parkId);
    const sourceIds = getParkLiveDataIds(parkId);
    if (sourceIds.length === 0) {
      throw new UnsupportedParkError(`Park ${parkId} is not in the canonical registry`);
    }

    const fetchSource = async (sourceId: string): Promise<LiveEntry[]> => {
      const res = await fetch(`${API_BASE}/entity/${sourceId}/live`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new UpstreamFetchError(`ThemeParks API error ${res.status}`);
      }
      return validLiveEntries(await res.json());
    };
    const [canonicalPayload, canonicalChildIds] = await Promise.all([
      fetchSource(sourceIds[0]),
      park?.filterLiveDataToChildren
        ? fetchCanonicalChildIds(parkId)
        : Promise.resolve<Set<string> | null>(null),
    ]);
    const aliasResults = await Promise.allSettled(
      sourceIds.slice(1).map(async (sourceId) => ({
        sourceId,
        payload: await fetchSource(sourceId),
      }))
    );
    const mergedById = new Map(canonicalPayload.map((entry) => [entry.id, entry]));
    for (const [index, result] of aliasResults.entries()) {
      if (result.status === 'rejected') {
        console.warn(
          `ThemeParks alias live feed degraded (source ${sourceIds[index + 1]}) for ` +
            `canonical park ${parkId}; ` +
            'continuing with available canonical/alias data.'
        );
        continue;
      }
      for (const entry of result.value.payload) {
        if (!mergedById.has(entry.id)) mergedById.set(entry.id, entry);
      }
    }
    const mergedLiveData = [...mergedById.values()];
    const liveData = canonicalChildIds
      ? mergedLiveData.filter((entry) => canonicalChildIds.has(entry.id))
      : mergedLiveData;
    const fetchedAt = new Date().toISOString();
    parkDataCache[parkId] = { liveData, fetchedAt };

    return { liveData, fetchedAt, stale: false, source: 'upstream' };
  } catch (error) {
    const cached = parkDataCache[parkId];
    if (cached) {
      console.warn(`ThemeParks API unavailable for park ${parkId}, serving memory cache`, error);
      return { ...cached, stale: true, source: 'memory-cache' };
    }
    if (error instanceof UpstreamFetchError) throw error;
    throw new UpstreamFetchError(`ThemeParks API request failed for park ${parkId}`);
  }
}

function formatWaitTimeEntry(
  entry: LiveEntry,
  fetchedAt: Timestamp,
  forecastMeta?: ForecastMeta
): FormattedWaitTimeEntry {
  const upstreamWait = entry.queue?.STANDBY?.waitTime;
  const waitMinutes =
    typeof upstreamWait === 'number' && Number.isFinite(upstreamWait) && upstreamWait >= 0
      ? upstreamWait
      : null;

  return {
    attractionId: entry.id,
    attractionName: entry.name,
    status: entry.status || 'UNKNOWN',
    waitMinutes,
    lastUpdated: entry.lastUpdated || null,
    fetchedAt: fetchedAt.toDate().toISOString(),
    queue: entry.queue
      ? {
          RETURN_TIME: entry.queue.RETURN_TIME
            ? {
                state: entry.queue.RETURN_TIME.state,
                returnStart: entry.queue.RETURN_TIME.returnStart ?? null,
                returnEnd: entry.queue.RETURN_TIME.returnEnd ?? null,
              }
            : null,
          PAID_RETURN_TIME: entry.queue.PAID_RETURN_TIME
            ? {
                state: entry.queue.PAID_RETURN_TIME.state,
                returnStart: entry.queue.PAID_RETURN_TIME.returnStart ?? null,
                returnEnd: entry.queue.PAID_RETURN_TIME.returnEnd ?? null,
                price: entry.queue.PAID_RETURN_TIME.price ?? null,
              }
            : null,
          BOARDING_GROUP: entry.queue.BOARDING_GROUP
            ? {
                state: entry.queue.BOARDING_GROUP.state,
                currentGroupStart: entry.queue.BOARDING_GROUP.currentGroupStart ?? null,
                currentGroupEnd: entry.queue.BOARDING_GROUP.currentGroupEnd ?? null,
                estimatedWait: entry.queue.BOARDING_GROUP.estimatedWait ?? null,
              }
            : null,
        }
      : null,
    forecast: entry.forecast?.length
      ? entry.forecast.map((forecast) => ({
          time: forecast.time,
          waitTime: forecast.waitTime,
          percentage: forecast.percentage,
        }))
      : null,
    forecastMeta: forecastMeta ?? {
      source: 'none' as const,
      confidence: null,
      dataRange: null,
    },
    operatingHours: entry.operatingHours?.length
      ? entry.operatingHours.map((hours) => ({
          type: hours.type,
          startTime: hours.startTime,
          endTime: hours.endTime,
        }))
      : null,
  };
}

async function blendForecasts(
  parkId: string,
  liveData: LiveEntry[],
  fetchedAt: Timestamp
): Promise<FormattedWaitTimeEntry[]> {
  const dayOfWeek = fetchedAt.toDate().getDay();
  const needsHistorical = liveData.filter(
    (entry) => !entry.forecast || entry.forecast.length === 0
  );
  const aggregateMap: Record<string, ForecastAggregate | null> = {};

  if (needsHistorical.length > 0) {
    try {
      const refs = needsHistorical.map((entry) =>
        adminDb
          .collection('forecastAggregates')
          .doc(parkId)
          .collection('byDayOfWeek')
          .doc(String(dayOfWeek))
          .collection('attractions')
          .doc(entry.id)
      );
      // Bounded: an aggregate lookup that stalls or hangs must never block
      // the live wait-time response. A timeout here degrades exactly like a
      // read error (below) — forecast falls back to live-only ('none').
      const docs = await withTimeout(adminDb.getAll(...refs), BLEND_TIMEOUT_MS);
      if (docs) {
        for (let index = 0; index < docs.length; index++) {
          const doc = docs[index];
          aggregateMap[needsHistorical[index].id] = doc.exists
            ? (doc.data() as ForecastAggregate)
            : null;
        }
      } else {
        console.warn(
          `Forecast aggregate lookup timed out for park ${parkId}; degrading to live-only forecasts`
        );
      }
    } catch (error) {
      console.error('Failed to read forecast aggregates:', error);
    }
  }

  return liveData.map((entry) => {
    const liveForecast = entry.forecast?.length ? entry.forecast : null;
    const aggregate = aggregateMap[entry.id] ?? null;
    const { entries, meta } = resolveForecast(liveForecast, aggregate);
    const formattedEntry = formatWaitTimeEntry(entry, fetchedAt, meta);
    if (meta.source === 'historical' && entries) {
      formattedEntry.forecast = entries;
    }
    return formattedEntry;
  });
}

async function writeCurrentWaitTimes(
  parkId: string,
  entries: FormattedWaitTimeEntry[],
  fetchedAt: string
) {
  // Single bounded cache document per park, written alongside the existing
  // per-attraction docs (same batch, no extra round trip) so the read-first
  // fast path (readParkCacheDoc) has one cheap point-read instead of a
  // collection query. Existing per-attraction docs are always written
  // regardless — this is purely an additive fast-path, not a replacement.
  const cachePayload = buildCacheDocPayload(entries, fetchedAt);
  let cacheDocWritten = false;

  for (let index = 0; index < entries.length; index += BATCH_SIZE) {
    const batch = adminDb.batch();
    for (const entry of entries.slice(index, index + BATCH_SIZE)) {
      const ref = adminDb
        .collection('waitTimes')
        .doc(parkId)
        .collection('current')
        .doc(entry.attractionId);
      batch.set(ref, entry, { merge: true });
    }
    if (index === 0 && cachePayload) {
      batch.set(parkCacheDocRef(parkId), cachePayload);
      cacheDocWritten = true;
    }
    await batch.commit();
  }

  if (entries.length === 0 && cachePayload && !cacheDocWritten) {
    const batch = adminDb.batch();
    batch.set(parkCacheDocRef(parkId), cachePayload);
    await batch.commit();
  }
}

async function archiveHistoricalSnapshot(
  parkId: string,
  liveData: LiveEntry[],
  fetchedAt: Timestamp
) {
  const time = fetchedAt.toDate().toISOString();
  const date = time.slice(0, 10);

  for (let index = 0; index < liveData.length; index += BATCH_SIZE) {
    const batch = adminDb.batch();
    for (const entry of liveData.slice(index, index + BATCH_SIZE)) {
      const ref = adminDb
        .collection('waitTimeHistory')
        .doc(parkId)
        .collection('daily')
        .doc(date)
        .collection('attractions')
        .doc(entry.id);
      batch.set(
        ref,
        {
          snapshots: FieldValue.arrayUnion({
            time,
            waitMinutes: entry.queue?.STANDBY?.waitTime ?? null,
          }),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }
}

async function runMaintenance(
  parkId: string,
  liveData: LiveEntry[],
  fetchedAt: Timestamp,
  options: { includeForecastAggregation: boolean }
) {
  const date = fetchedAt.toDate().toISOString().slice(0, 10);
  const tasks: Promise<void>[] = [archiveHistoricalSnapshot(parkId, liveData, fetchedAt)];
  // Read-amplifying: only run on the cron path (`awaitMaintenance: true`),
  // which has a generous 300s maxDuration and already guarantees a daily
  // pass over every configured park. See MAINTENANCE_DEADLINE_MS above for
  // the production evidence behind this split.
  if (options.includeForecastAggregation) {
    tasks.push(updateForecastAggregates(parkId, date));
  }

  const outcomes = await Promise.allSettled(tasks);

  if (outcomes[0].status === 'rejected') {
    console.error('Historical archive error:', outcomes[0].reason);
  }
  if (options.includeForecastAggregation && outcomes[1]?.status === 'rejected') {
    console.error('Forecast aggregation error:', outcomes[1].reason);
  }
}

function isFormattedWaitTimeEntry(data: unknown): data is FormattedWaitTimeEntry {
  if (!data || typeof data !== 'object') return false;
  const entry = data as Record<string, unknown>;
  return (
    typeof entry.attractionId === 'string' &&
    entry.attractionId.length > 0 &&
    typeof entry.attractionName === 'string' &&
    typeof entry.fetchedAt === 'string' &&
    Number.isFinite(Date.parse(entry.fetchedAt))
  );
}

async function readFirestoreCache(parkId: string): Promise<ParkRefreshResult | null> {
  const snapshot = await adminDb
    .collection('waitTimes')
    .doc(parkId)
    .collection('current')
    .get();
  const entries = snapshot.docs
    .map((doc) => doc.data())
    .filter(isFormattedWaitTimeEntry);

  if (entries.length === 0) return null;

  const fetchedAt = entries.reduce(
    (latest, entry) =>
      Date.parse(entry.fetchedAt) > Date.parse(latest) ? entry.fetchedAt : latest,
    entries[0].fetchedAt
  );
  return {
    entries,
    meta: responseMeta('firestore-cache', fetchedAt, true),
  };
}

export async function refreshPark(
  parkId: string,
  options: { awaitMaintenance?: boolean } = {}
): Promise<ParkRefreshResult> {
  if (!getParkById(parkId)) {
    throw new UnsupportedParkError(`Unsupported park: ${parkId}`);
  }

  // Coalesce concurrent refresh requests for the same park *in the same
  // refresh mode* onto a single in-flight fetch + write chain rather than
  // each caller independently hitting the upstream API and Firestore. A
  // forced (cron) refresh never joins — and is never joined by — a public
  // read-path refresh; see `refreshCoalescingKey`.
  const key = refreshCoalescingKey(parkId, options);
  const existing = inFlightRefreshes[key];
  if (existing) return existing;

  const promise = doRefreshPark(parkId, options);
  inFlightRefreshes[key] = promise;
  try {
    return await promise;
  } finally {
    delete inFlightRefreshes[key];
  }
}

async function doRefreshPark(
  parkId: string,
  options: { awaitMaintenance?: boolean }
): Promise<ParkRefreshResult> {
  const totalStart = Date.now();
  const timing: ParkRefreshTiming = { totalMs: 0 };

  // Read-first: a fresh-enough single-doc cache hit skips upstream and
  // persistence entirely. This is the cross-instance-safe complement to the
  // in-process inFlightRefreshes coalescing above — a Firestore document is
  // visible to every serverless instance, not just the one that happens to
  // still have the in-memory promise. Skipped when the caller explicitly
  // wants a forced refresh (cron's `awaitMaintenance: true`), since cron's
  // entire purpose is to guarantee a genuine upstream refresh on schedule.
  const cacheReadStart = Date.now();
  const freshCache = options.awaitMaintenance ? null : await readFreshParkCache(parkId);
  timing.cacheReadMs = Date.now() - cacheReadStart;

  if (freshCache) {
    const ageMs = Date.now() - Date.parse(freshCache.fetchedAt);
    if (ageMs <= CACHE_READ_TTL_MS) {
      timing.totalMs = Date.now() - totalStart;
      logRequestTelemetry(parkId, { ...timing, outcome: 'cache-hit' });
      return {
        entries: freshCache.entries,
        meta: responseMeta('firestore-cache', freshCache.fetchedAt, false),
        timing,
      };
    }
  }

  let liveResult: LiveDataResult;
  const upstreamStart = Date.now();
  try {
    liveResult = await fetchLiveDataForPark(parkId);
  } catch (upstreamError) {
    timing.upstreamMs = Date.now() - upstreamStart;
    try {
      const firestoreResult = await withTimeout(readFirestoreCache(parkId), FALLBACK_CACHE_TIMEOUT_MS);
      if (firestoreResult) {
        console.warn(`Serving Firestore wait-time cache for park ${parkId}`);
        timing.totalMs = Date.now() - totalStart;
        logRequestTelemetry(parkId, { ...timing, outcome: 'stale-fallback' });
        return { ...firestoreResult, timing };
      }
    } catch (firestoreError) {
      console.error(`Failed to read Firestore wait-time cache for park ${parkId}:`, firestoreError);
    }
    logRequestTelemetry(parkId, { ...timing, totalMs: Date.now() - totalStart, outcome: 'failed' });
    throw upstreamError;
  }
  timing.upstreamMs = Date.now() - upstreamStart;

  const fetchedAt = Timestamp.fromDate(new Date(liveResult.fetchedAt));
  const blendStart = Date.now();
  const entries = await blendForecasts(parkId, liveResult.liveData, fetchedAt);
  timing.blendMs = Date.now() - blendStart;
  timing.totalMs = Date.now() - totalStart;

  const result: ParkRefreshResult = {
    entries,
    meta: responseMeta(liveResult.source, liveResult.fetchedAt, liveResult.stale),
    timing,
  };

  if (!liveResult.stale) {
    // Persistence (write + maintenance) must never block the response: a
    // fresh upstream result is returned to the caller immediately, and the
    // Firestore write + any maintenance is dispatched via `after()` (or
    // fire-and-forget outside a request scope). Previously only maintenance
    // was deferred like this — the write itself was still awaited before
    // the response returned, which meant a slow/cold Firestore write could
    // itself contribute to the response's latency even on a fast upstream
    // fetch. See `wait-times-response-deadline.test.ts`.
    const persistAndMaintain = (async () => {
      const writeStart = Date.now();
      try {
        await writeCurrentWaitTimes(parkId, entries, liveResult.fetchedAt);
        logRequestTelemetry(parkId, {
          stage: 'persist-write',
          ok: true,
          durationMs: Date.now() - writeStart,
        });
      } catch (writeError) {
        // Explicit, structured, secret-free failure signal. Previously a
        // write failure here was only visible as an uncaught rejection on
        // the `after()`-deferred promise (or not at all, if nothing ever
        // attached a rejection handler) — this was the concrete "invisible
        // failure" reported for Universal-family parks.
        logRequestTelemetry(parkId, {
          stage: 'persist-write',
          ok: false,
          durationMs: Date.now() - writeStart,
          error: (writeError as Error).message,
        });
        throw writeError;
      }

      // Skip kicking off another maintenance run if one is still in flight
      // for this park (e.g. a previous request's background
      // archive/aggregate work hasn't finished yet). Without this guard,
      // repeated/rapid requests for the same park pile up concurrent
      // Firestore reads/writes and were observed to starve the primary
      // write above for tens of seconds to multiple minutes.
      if (!maintenanceInFlight[parkId]) {
        const maintenanceStart = Date.now();
        const maintenance = withTimeout(
          runMaintenance(parkId, liveResult.liveData, fetchedAt, {
            includeForecastAggregation: !!options.awaitMaintenance,
          }),
          MAINTENANCE_DEADLINE_MS
        )
          .then((completed) => {
            logRequestTelemetry(parkId, {
              stage: 'persist-maintenance',
              ok: completed !== null,
              timedOut: completed === null,
              durationMs: Date.now() - maintenanceStart,
            });
          })
          .finally(() => {
            delete maintenanceInFlight[parkId];
          });
        maintenanceInFlight[parkId] = maintenance;
        await maintenance;
      }
    })();

    if (options.awaitMaintenance) {
      await persistAndMaintain;
    } else {
      // Attach a no-op catch before handing to `after()`: the failure is
      // already logged above via `logRequestTelemetry`, this only prevents
      // a redundant unhandled-rejection warning on the deferred promise.
      scheduleBackgroundWork(persistAndMaintain.catch(() => {}));
    }
  }

  logRequestTelemetry(parkId, { ...timing, outcome: liveResult.source });
  return result;
}

// Schedules fire-and-forget work using Next.js's `after()` when available so
// Vercel keeps the serverless function instance alive until it completes.
// Un-awaited ("void") promises have no such guarantee: Vercel may freeze the
// function immediately after the response is sent and only resume the
// suspended promise when/if the same instance is reused for a later request,
// where it then competes with that unrelated request's own work. This was
// evidence-backed as a contributor to /api/wait-times production requests
// taking 40-170+ seconds and 504ing. `after()` throws when called outside an
// active request scope (e.g. plain unit tests or scripts), so fall back to a
// plain fire-and-forget in that case.
function scheduleBackgroundWork(work: Promise<void>) {
  try {
    after(() => work);
  } catch {
    void work;
  }
}

export async function getConfiguredParkIds(): Promise<ConfiguredParkIds> {
  const parksSnapshot = await adminDb.collection('parks').get();
  const ids = [
    ...new Set(
      parksSnapshot.docs.map((doc) => {
        const data = doc.data() as { id?: string };
        return data.id || doc.id;
      })
    ),
  ];
  return {
    supported: ids.filter((id) => !!getParkById(id)),
    unsupported: ids.filter((id) => !getParkById(id)),
  };
}

function publicRefreshError(error: unknown): string {
  if (error instanceof RefreshDeadlineError) {
    return 'Wait-time refresh exceeded the response deadline.';
  }
  if (error instanceof UnsupportedParkError) {
    return 'Park is not present in the supported park registry.';
  }
  if (error instanceof UpstreamFetchError) {
    return 'Wait-time provider and persistent cache are unavailable.';
  }
  return 'Wait-time refresh failed.';
}

export async function refreshParksBounded(
  parkIds: string[],
  concurrency = 6,
  options: { awaitMaintenance?: boolean } = {}
): Promise<RefreshManyResult[]> {
  const results: RefreshManyResult[] = new Array(parkIds.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= parkIds.length) return;
      const parkId = parkIds[index];
      try {
        const result = await refreshPark(parkId, options);
        results[index] = {
          parkId,
          status: result.meta.stale ? 'stale' : 'fresh',
          source: result.meta.source,
          fetchedAt: result.meta.fetchedAt,
        };
      } catch (error) {
        results[index] = {
          parkId,
          status: 'failed',
          error: publicRefreshError(error),
        };
      }
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), parkIds.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export interface ParkRefreshOutcome {
  parkId: string;
  result?: ParkRefreshResult;
  error?: string;
}

// Bounded-concurrency variant of refreshParksBounded that returns the full
// per-park entries + meta (not just a status summary), for the no-parkId
// "all configured parks" branch of GET /api/wait-times.
//
// Three properties matter here, and all three are load-bearing:
//
//  1. Fan-out, not a sequential loop. A `for...of` + `await` loop makes total
//     request duration scale linearly with the park count — exactly the shape
//     of request that 504s as the catalog grows. A worker pool caps the peak
//     concurrent upstream/Firestore load instead of removing the cap.
//  2. Read-first per park. Each worker calls `refreshPark`, which begins with
//     a bounded single-doc Firestore cache read and returns immediately on a
//     hit within CACHE_READ_TTL_MS. In steady state this branch therefore
//     issues *zero* upstream fetches; only cold/expired parks refresh.
//  3. A hard overall deadline. Whatever the fan-out cannot finish inside
//     `deadlineMs` is reported as an explicit per-park error rather than
//     being silently omitted or returned as success-shaped empty data. Each
//     park is raced against the *remaining* budget, so the whole branch stays
//     inside the route's declared latency contract regardless of park count.
export async function refreshParksBoundedWithData(
  parkIds: string[],
  options: { concurrency?: number; deadlineMs?: number } = {}
): Promise<Record<string, ParkRefreshOutcome>> {
  const concurrency = options.concurrency ?? 8;
  const deadlineAt =
    options.deadlineMs === undefined ? undefined : Date.now() + options.deadlineMs;
  const results: Record<string, ParkRefreshOutcome> = {};
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex++;
      if (index >= parkIds.length) return;
      const parkId = parkIds[index];
      const remainingMs = deadlineAt === undefined ? undefined : deadlineAt - Date.now();

      if (remainingMs !== undefined && remainingMs <= 0) {
        results[parkId] = {
          parkId,
          error: publicRefreshError(new RefreshDeadlineError('Deadline elapsed before start')),
        };
        continue;
      }

      try {
        const refresh = refreshPark(parkId);
        results[parkId] = {
          parkId,
          result: remainingMs === undefined ? await refresh : await withDeadline(refresh, remainingMs),
        };
      } catch (error) {
        results[parkId] = { parkId, error: publicRefreshError(error) };
      }
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), parkIds.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
