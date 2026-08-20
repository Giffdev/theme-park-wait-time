export interface AllParksWaitTimeEntry {
  attractionId: string;
  attractionName: string;
  status: string;
  waitMinutes: number | null;
  fetchedAt?: string;
}

export interface AllParksWaitTimeMeta {
  stale: boolean;
  source: 'upstream' | 'memory-cache' | 'firestore-cache';
  fetchedAt: string;
  ageSeconds: number;
}

export interface AllParksWaitTimesResponse {
  fetchedAt: string;
  stale: boolean;
  parkMeta: Record<string, AllParksWaitTimeMeta>;
  errors?: Record<string, string>;
  parks: Record<string, AllParksWaitTimeEntry[]>;
}

let allParksRequestInFlight: Promise<AllParksWaitTimesResponse> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAllParksWaitTimesResponse(value: unknown): value is AllParksWaitTimesResponse {
  if (!isRecord(value) || typeof value.fetchedAt !== 'string' || typeof value.stale !== 'boolean') {
    return false;
  }
  if (!isRecord(value.parkMeta) || !isRecord(value.parks)) return false;
  if (Number.isNaN(new Date(value.fetchedAt).getTime())) return false;

  const validMeta = Object.values(value.parkMeta).every((meta) =>
    isRecord(meta)
    && typeof meta.stale === 'boolean'
    && (
      meta.source === 'upstream'
      || meta.source === 'memory-cache'
      || meta.source === 'firestore-cache'
    )
    && typeof meta.fetchedAt === 'string'
    && !Number.isNaN(new Date(meta.fetchedAt).getTime())
    && typeof meta.ageSeconds === 'number'
  );
  const validParks = Object.values(value.parks).every((entries) =>
    Array.isArray(entries)
    && entries.every((entry) =>
      isRecord(entry)
      && typeof entry.attractionId === 'string'
      && typeof entry.attractionName === 'string'
      && typeof entry.status === 'string'
      && (entry.waitMinutes === null || typeof entry.waitMinutes === 'number')
      && (entry.fetchedAt === undefined || typeof entry.fetchedAt === 'string')
    )
  );
  const validErrors = value.errors === undefined
    || (isRecord(value.errors) && Object.values(value.errors).every(
      (error) => typeof error === 'string'
    ));

  return validMeta && validParks && validErrors;
}

/**
 * Calls the server-owned all-parks refresh path. Concurrent callers in the
 * same browser share one request, while Vercel's response
 * cache coalesces requests across users and serverless instances.
 */
export function refreshAllParksWaitTimes(): Promise<AllParksWaitTimesResponse> {
  if (allParksRequestInFlight) return allParksRequestInFlight;

  const request = (async () => {
    const response = await fetch('/api/wait-times', {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Wait-time refresh failed with status ${response.status}`);
    }

    const body: unknown = await response.json();
    if (!isAllParksWaitTimesResponse(body)) {
      throw new Error('Wait-time refresh returned an invalid response');
    }
    return body;
  })();

  allParksRequestInFlight = request;
  const clearInFlight = () => {
    if (allParksRequestInFlight === request) {
      allParksRequestInFlight = null;
    }
  };
  void request.then(clearInFlight, clearInFlight);

  return request;
}
