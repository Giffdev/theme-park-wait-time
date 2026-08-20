import { after, NextResponse, type NextRequest } from 'next/server';
import { getAllParks, getParkById, getParkBySlug } from '@/lib/parks/park-registry';
import {
  getConfiguredParkIds,
  refreshPark,
  refreshParksBoundedWithData,
  RefreshDeadlineError,
  UpstreamFetchError,
  withDeadline,
  type ConfiguredParkIds,
  type ParkRefreshTiming,
  type ParkResponseMeta,
} from '@/lib/wait-times/refresh';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bounded fan-out for the no-parkId ("all supported parks") branch. The
// worker cap keeps peak concurrent upstream/Firestore load flat as the park
// catalog grows, and the deadline keeps the whole branch comfortably inside
// `maxDuration` (30s) no matter how many parks are configured. 20s matches
// the `no-parkid` budget in tests/config/wait-times-cold-concurrent-matrix.ts.
const ALL_PARKS_CONCURRENCY = 6;
const ALL_PARKS_DEADLINE_MS = 20_000;

// The canonical static registry is the normal all-parks source, so the
// Firestore catalog is not read on this hot path. This bound applies only to
// the defensive Firestore fallback used if the static registry is ever empty.
// The fallback must still fail explicitly rather than returning a
// success-shaped empty response.
const CONFIGURED_PARKS_DEADLINE_MS = 3_000;
const CONFIGURED_PARKS_OBSERVATION_INTERVAL_MS = 5 * 60 * 1000;

// CDN cache-control for the *public read* path only. In-process
// `refreshPark` in-flight coalescing collapses same-park bursts that land on
// one serverless instance; it can do nothing for bursts spread across
// instances. A short shared `s-maxage` lets Vercel's edge collapse those,
// and `stale-while-revalidate` means the refresh happens off the critical
// path of a user request instead of on it.
//
// `s-maxage` is deliberately shorter than the server-side single-doc cache
// TTL (CACHE_READ_TTL_MS, 45s) and far shorter than the client's own
// 2-minute staleness threshold, so the edge can never be the freshest-data
// bottleneck. Degraded responses (any park serving stale data) get a much
// smaller window so stale data is never pinned at the edge for long, and any
// response carrying per-park errors is not shared at all.
const FRESH_CACHE_CONTROL = 'public, s-maxage=30, stale-while-revalidate=60';
const DEGRADED_CACHE_CONTROL = 'public, s-maxage=5, stale-while-revalidate=30';
const NO_STORE = 'no-store, max-age=0';

// Message used when the defensive Firestore fallback contains a document
// outside park-registry.ts. Firestore-only custom, inactive, retired, or
// historical documents never become provider refresh targets: the static
// registry is the product-support boundary, matching public park-document
// filtering in `filterCurrentParkDocuments`.
const CATALOG_MISMATCH_ERROR = 'Park is not present in the supported park registry.';

interface StageTimings {
  cacheReadMs?: number;
  upstreamMs?: number;
  blendMs?: number;
}

// Parks in the fan-out branch are refreshed concurrently, so the stage cost
// that actually sits on the response's critical path is the slowest park's,
// not the sum of all of them.
function mergeStageTimings(target: StageTimings, timing?: ParkRefreshTiming): StageTimings {
  if (!timing) return target;
  const stages = ['cacheReadMs', 'upstreamMs', 'blendMs'] as const;
  for (const stage of stages) {
    const value = timing[stage];
    if (typeof value !== 'number') continue;
    target[stage] = Math.max(target[stage] ?? 0, value);
  }
  return target;
}

// Server-Timing exposes per-stage latency so an operator can tell "upstream
// was slow" from "our blend was slow" from "our cache read was slow" without
// shipping logs anywhere. Values are numbers and fixed stage labels only —
// never env values, credentials, error text, or request headers.
function serverTiming(stages: StageTimings, routeMs: number, parkCount: number): string {
  return [
    typeof stages.cacheReadMs === 'number' ? `cache;dur=${stages.cacheReadMs}` : null,
    typeof stages.upstreamMs === 'number' ? `upstream;dur=${stages.upstreamMs}` : null,
    typeof stages.blendMs === 'number' ? `blend;dur=${stages.blendMs}` : null,
    `parks;desc="${parkCount}"`,
    `route;dur=${routeMs}`,
  ]
    .filter((metric): metric is string => metric !== null)
    .join(', ');
}

function responseHeaders(cacheControl: string, timing: string): Record<string, string> {
  return { 'Cache-Control': cacheControl, 'Server-Timing': timing };
}

// Cache-control policy:
//   • any *transient* per-park error (upstream down, deadline elapsed,
//     Firestore unreadable) → no-store. A failure must never be pinned at
//     the edge, because the next request might well succeed.
//   • static registry/catalog mismatch only → degraded window. The mismatch
//     cannot resolve itself between two requests seconds apart, so sharing
//     the response is safe; the short window keeps it from outliving a
//     catalog fix by more than a few seconds.
//   • stale (any park serving fallback data) → degraded window.
function cacheControlFor(options: {
  stale: boolean;
  hasTransientErrors: boolean;
  hasCatalogMismatch: boolean;
}): string {
  if (options.hasTransientErrors) return NO_STORE;
  if (options.stale || options.hasCatalogMismatch) return DEGRADED_CACHE_CONTROL;
  return FRESH_CACHE_CONTROL;
}

function logRouteTelemetry(fields: Record<string, unknown>) {
  console.log(JSON.stringify({ scope: 'wait-times-route', ...fields }));
}

interface AllParksSelection extends ConfiguredParkIds {
  source: 'static-registry' | 'firestore-fallback';
}

class ParkListUnavailableError extends Error {}

let nextConfiguredParksObservationAt = 0;

function parkListFailureReason(error: unknown): string {
  if (error instanceof RefreshDeadlineError) return 'deadline';
  if (error instanceof ParkListUnavailableError) return 'no-supported-parks';
  return 'firestore-read';
}

function logParkListFailure(stage: string, error: unknown) {
  console.error('Wait-time configured park catalog read failed:', error);
  logRouteTelemetry({
    mode: 'all-parks',
    stage,
    status: 'failed',
    reason: parkListFailureReason(error),
  });
}

function observeConfiguredParkCatalog() {
  const now = Date.now();
  if (now < nextConfiguredParksObservationAt) return;
  nextConfiguredParksObservationAt = now + CONFIGURED_PARKS_OBSERVATION_INTERVAL_MS;

  const observe = async () => {
    try {
      const configured = await withDeadline(
        getConfiguredParkIds(),
        CONFIGURED_PARKS_DEADLINE_MS
      );
      logRouteTelemetry({
        mode: 'all-parks',
        stage: 'park-list-observation',
        status: 'ok',
        supportedCount: configured.supported.length,
        unsupportedCount: configured.unsupported.length,
      });
    } catch (error) {
      logParkListFailure('park-list-observation', error);
    }
  };

  try {
    after(observe);
  } catch {
    void observe();
  }
}

async function resolveAllParksSelection(): Promise<AllParksSelection> {
  const supported = [...new Set(getAllParks().map((park) => park.id))];
  if (supported.length > 0) {
    return { supported, unsupported: [], source: 'static-registry' };
  }

  try {
    const configured = await withDeadline(
      getConfiguredParkIds(),
      CONFIGURED_PARKS_DEADLINE_MS
    );
    if (configured.supported.length === 0) {
      throw new ParkListUnavailableError(
        'Neither the static registry nor Firestore supplied a supported park id.'
      );
    }
    return { ...configured, source: 'firestore-fallback' };
  } catch (error) {
    logParkListFailure('park-list-fallback', error);
    throw error instanceof ParkListUnavailableError
      ? error
      : new ParkListUnavailableError('Configured park fallback is unavailable.');
  }
}

export async function GET(request: NextRequest) {
  const routeStart = Date.now();
  const stages: StageTimings = {};
  let parkCount = 0;
  let parkListSource: AllParksSelection['source'] | undefined;

  const elapsed = () => Date.now() - routeStart;
  const timingHeader = () => serverTiming(stages, elapsed(), parkCount);

  try {
    const { searchParams } = new URL(request.url);
    const hasParkId = searchParams.has('parkId');
    const requestedParkId = searchParams.get('parkId')?.trim() ?? '';
    const results: Record<string, unknown[]> = {};
    const parkMeta: Record<string, ParkResponseMeta> = {};
    const errors: Record<string, string> = {};
    // Park ids whose only "error" is that the Firestore catalog lists a park
    // park-registry.ts doesn't support. Tracked separately from `errors` so
    // the JSON body stays honest while cache-control can distinguish a
    // static catalog condition from a transient failure.
    const catalogMismatches = new Set<string>();
    let isStale = false;

    if (hasParkId) {
      if (!requestedParkId) {
        return NextResponse.json(
          { error: 'parkId must be a non-empty park slug or entity UUID.' },
          { status: 400, headers: responseHeaders(NO_STORE, timingHeader()) }
        );
      }

      const resolved = UUID_PATTERN.test(requestedParkId)
        ? getParkById(requestedParkId.toLowerCase())
        : getParkBySlug(requestedParkId);
      if (!resolved) {
        return NextResponse.json(
          { error: `Unknown park: "${requestedParkId}". Use a valid park slug or entity UUID.` },
          { status: 400, headers: responseHeaders(NO_STORE, timingHeader()) }
        );
      }

      const refresh = await refreshPark(resolved.id);
      parkCount = 1;
      mergeStageTimings(stages, refresh.timing);
      results[requestedParkId] = refresh.entries;
      parkMeta[requestedParkId] = refresh.meta;
      isStale = refresh.meta.stale;
    } else {
      let configured: AllParksSelection;
      try {
        configured = await resolveAllParksSelection();
      } catch (error) {
        if (!(error instanceof ParkListUnavailableError)) throw error;
        logRouteTelemetry({ mode: 'all-parks', status: 503, parkCount: 0, routeMs: elapsed() });
        return NextResponse.json(
          { error: 'Configured park list is temporarily unavailable.' },
          { status: 503, headers: responseHeaders(NO_STORE, timingHeader()) }
        );
      }
      parkListSource = configured.source;
      if (configured.source === 'static-registry') {
        // Preserve catalog-drift observability without putting the Firestore
        // collection scan back on the provider response's critical path.
        observeConfiguredParkCatalog();
      }

      for (const parkId of configured.unsupported) {
        results[parkId] = [];
        errors[parkId] = CATALOG_MISMATCH_ERROR;
        catalogMismatches.add(parkId);
      }

      // Bounded, deadline-capped fan-out instead of a sequential per-park
      // loop. Each park still goes through refreshPark's read-first cache,
      // so warm park data resolves without touching upstream at all.
      const outcomes = await refreshParksBoundedWithData(configured.supported, {
        concurrency: ALL_PARKS_CONCURRENCY,
        deadlineMs: ALL_PARKS_DEADLINE_MS,
      });

      for (const parkId of configured.supported) {
        const outcome = outcomes[parkId];
        if (outcome?.result) {
          parkCount += 1;
          mergeStageTimings(stages, outcome.result.timing);
          results[parkId] = outcome.result.entries;
          parkMeta[parkId] = outcome.result.meta;
          if (outcome.result.meta.stale) isStale = true;
        } else {
          // Never success-shaped silence: a park we could not read is
          // reported with an explicit error and no parkMeta entry, so a
          // client cannot mistake it for "this park has no attractions".
          results[parkId] = [];
          const message = outcome?.error ?? 'Wait-time refresh failed.';
          errors[parkId] = message;
          // A supported park can still report the registry-mismatch message
          // if the catalog and registry disagree mid-flight; that is the
          // same static condition, not a transient failure.
          if (message === CATALOG_MISMATCH_ERROR) catalogMismatches.add(parkId);
        }
      }

      // If every supported park failed there is no honest 200 to return —
      // the response would be an empty shell that looks successful.
      if (configured.supported.length > 0 && parkCount === 0) {
        logRouteTelemetry({
          mode: 'all-parks',
          status: 502,
          parkCount,
          errorCount: Object.keys(errors).length,
          routeMs: elapsed(),
        });
        return NextResponse.json(
          {
            error: 'Wait times are unavailable for every configured park.',
            errors,
          },
          { status: 502, headers: responseHeaders(NO_STORE, timingHeader()) }
        );
      }
    }

    const errorIds = Object.keys(errors);
    const hasErrors = errorIds.length > 0;
    const catalogMismatchCount = catalogMismatches.size;
    const transientErrorCount = errorIds.filter((id) => !catalogMismatches.has(id)).length;
    const routeMs = elapsed();
    logRouteTelemetry({
      mode: hasParkId ? 'park' : 'all-parks',
      status: 200,
      parkCount,
      errorCount: errorIds.length,
      catalogMismatchCount,
      transientErrorCount,
      stale: isStale,
      ...(parkListSource ? { parkListSource } : {}),
      ...stages,
      routeMs,
    });

    return NextResponse.json(
      {
        fetchedAt: new Date().toISOString(),
        stale: isStale,
        parkMeta,
        ...(hasErrors ? { errors } : {}),
        parks: results,
      },
      {
        headers: responseHeaders(
          cacheControlFor({
            stale: isStale,
            hasTransientErrors: transientErrorCount > 0,
            hasCatalogMismatch: catalogMismatchCount > 0,
          }),
          serverTiming(stages, routeMs, parkCount)
        ),
      }
    );
  } catch (error) {
    console.error('Wait times API error:', error);
    const status = error instanceof UpstreamFetchError ? 502 : 500;
    logRouteTelemetry({ mode: 'error', status, parkCount, routeMs: elapsed() });
    return NextResponse.json(
      {
        error:
          error instanceof UpstreamFetchError
            ? 'Wait-time provider is temporarily unavailable'
            : 'Failed to fetch wait times',
      },
      { status, headers: responseHeaders(NO_STORE, timingHeader()) }
    );
  }
}
