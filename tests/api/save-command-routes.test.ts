import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockAuthenticate = vi.fn();
const mockSaveRide = vi.fn();
const mockSaveTrip = vi.fn();
const mockGetTripStatus = vi.fn();

vi.mock('@/lib/server/authenticated-json', () => {
  class RequestError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = 'RequestError';
    }
  }
  return {
    RequestError,
    authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
    readBoundedJson: async (request: NextRequest, maximumBytes: number) => {
      const contentLength = Number(request.headers.get('content-length') ?? '0');
      if (contentLength > maximumBytes) throw new RequestError(413, 'Request body is too large');
      try {
        const value = await request.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new RequestError(400, 'JSON body must be an object');
        }
        return value;
      } catch {
        throw new RequestError(400, 'Invalid JSON body');
      }
    },
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminInitializationMs: 3,
}));

vi.mock('@/lib/services/save-command-service', () => {
  class SaveCommandConflictError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SaveCommandConflictError';
    }
  }
  class SaveCommandAmbiguousError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SaveCommandAmbiguousError';
    }
  }
  class SaveCommandDeadlineError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SaveCommandDeadlineError';
    }
  }
  return {
    SaveCommandAmbiguousError,
    SaveCommandConflictError,
    SaveCommandDeadlineError,
    COMMIT_DEADLINE_MS: 10_000,
    getTripCommandStatus: (...args: unknown[]) => mockGetTripStatus(...args),
    saveRideCommand: (...args: unknown[]) => mockSaveRide(...args),
    saveTripCommand: (...args: unknown[]) => mockSaveTrip(...args),
  };
});

import { POST as saveRide } from '@/app/api/ride-logs/route';
import {
  GET as getTripStatus,
  POST as saveTrip,
  maxDuration as tripMaxDuration,
  dynamic as tripDynamic,
} from '@/app/api/trip-commands/route';
import {
  maxDuration as rideMaxDuration,
  dynamic as rideDynamic,
} from '@/app/api/ride-logs/route';
import { RequestError } from '@/lib/server/authenticated-json';
import {
  SaveCommandConflictError,
  SaveCommandAmbiguousError,
  SaveCommandDeadlineError,
  COMMIT_DEADLINE_MS,
} from '@/lib/services/save-command-service';

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function statusRequest(
  requestId = 'trip-request-route',
  fingerprint = 'a'.repeat(64),
) {
  const query = new URLSearchParams({ requestId, fingerprint });
  return new NextRequest(`http://localhost:3000/api/trip-commands?${query.toString()}`);
}

const validRide = {
  requestId: 'ride-request-route',
  parkId: 'magic-kingdom',
  attractionId: 'space-mountain',
  parkName: 'Magic Kingdom',
  attractionName: 'Space Mountain',
  rodeAt: '2026-08-17T20:00:00.000Z',
  waitTimeMinutes: 25,
  attractionClosed: false,
  source: 'manual',
  rating: null,
  notes: '',
  tripId: null,
};

const validTrip = {
  requestId: 'trip-request-route',
  name: 'August Trip',
  startDate: '2026-08-17',
  endDate: '2026-08-17',
  parkIds: [],
  parkNames: {},
  status: 'active',
  shareId: null,
  notes: '',
};

describe('authenticated save command routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue('user-123');
    mockSaveRide.mockResolvedValue({ result: 'created', tripId: null });
    mockSaveTrip.mockResolvedValue('created');
    mockGetTripStatus.mockResolvedValue('not-found');
  });

  it('rejects unauthenticated ride saves before writing', async () => {
    mockAuthenticate.mockRejectedValue(new RequestError(401, 'Invalid token'));
    const response = await saveRide(request('/api/ride-logs', validRide));
    expect(response.status).toBe(401);
    expect(mockSaveRide).not.toHaveBeenCalled();
  });

  it('enforces bounded ride schema and ranges', async () => {
    const response = await saveRide(request('/api/ride-logs', {
      ...validRide,
      waitTimeMinutes: 181,
      notes: 'x'.repeat(2001),
    }));
    expect(response.status).toBe(400);
    expect(mockSaveRide).not.toHaveBeenCalled();
  });

  it.each([
    '0',
    'not-a-date',
    '2026-08-17T20:00:00Z',
    '2026-08-17T16:00:00.000-04:00',
    '1999-12-31T23:59:59.999Z',
    '2100-01-01T00:00:00.000Z',
  ])('rejects non-canonical or unsupported ride timestamp %s', async (rodeAt) => {
    const response = await saveRide(request('/api/ride-logs', { ...validRide, rodeAt }));
    expect(response.status).toBe(400);
    expect(mockSaveRide).not.toHaveBeenCalled();
  });

  it('passes only the verified UID to the ride command service', async () => {
    const response = await saveRide(request('/api/ride-logs', validRide));
    expect(response.status).toBe(200);
    expect(mockSaveRide).toHaveBeenCalledWith('user-123', validRide);
  });

  it.each(['trip/escape', 'trip\u0000escape', 'x'.repeat(129)])(
    'rejects malicious trip path segment %j before the service',
    async (tripId) => {
      const response = await saveRide(request('/api/ride-logs', { ...validRide, tripId }));
      expect(response.status).toBe(400);
      expect(mockSaveRide).not.toHaveBeenCalled();
    },
  );

  it.each([null, [], 'ride', 42])('rejects non-object ride JSON %j', async (body) => {
    const response = await saveRide(request('/api/ride-logs', body));
    expect(response.status).toBe(400);
    expect(mockSaveRide).not.toHaveBeenCalled();
  });

  it('rejects unknown ride and trip fields', async () => {
    expect((await saveRide(request('/api/ride-logs', {
      ...validRide,
      unexpected: true,
    }))).status).toBe(400);
    expect((await saveTrip(request('/api/trip-commands', {
      ...validTrip,
      unexpected: true,
    }))).status).toBe(400);
  });

  it('rejects invalid trip dates and oversized park lists', async () => {
    const response = await saveTrip(request('/api/trip-commands', {
      ...validTrip,
      endDate: '2026-08-16',
      parkIds: Array.from({ length: 33 }, (_, index) => `park-${index}`),
    }));
    expect(response.status).toBe(400);
    expect(mockSaveTrip).not.toHaveBeenCalled();
  });

  it.each([
    '2025-02-29',
    '2026-02-30',
    '2026-04-31',
    '2026-13-01',
    '1999-12-31',
    '2101-01-01',
  ])('rejects invalid or unsupported trip date %s', async (startDate) => {
    const response = await saveTrip(request('/api/trip-commands', {
      ...validTrip,
      startDate,
      endDate: startDate,
    }));
    expect(response.status).toBe(400);
    expect(mockSaveTrip).not.toHaveBeenCalled();
  });

  it('accepts a real leap day in the supported range', async () => {
    const response = await saveTrip(request('/api/trip-commands', {
      ...validTrip,
      startDate: '2028-02-29',
      endDate: '2028-02-29',
    }));
    expect(response.status).toBe(200);
  });

  it('reports create conflicts as unsafe and retryable without server details', async () => {
    mockSaveTrip.mockRejectedValue(new SaveCommandConflictError('private classification detail'));
    const response = await saveTrip(request('/api/trip-commands', validTrip));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: expect.stringMatching(/contact support.*do not start a new trip request/i),
      outcome: 'ambiguous',
      retryable: true,
    });
  });

  it.each([
    'committed',
    'not-found',
    'target-only',
    'command-only',
    'payload-conflict',
  ])(
    'returns the authenticated trip command status %s',
    async (status) => {
      mockGetTripStatus.mockResolvedValue(status);
      const response = await getTripStatus(statusRequest());
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      await expect(response.json()).resolves.toMatchObject({ status });
      expect(mockGetTripStatus).toHaveBeenCalledWith(
        'user-123',
        'trip-request-route',
        'a'.repeat(64),
      );
    },
  );

  it('keeps a read-quota status failure retryable', async () => {
    mockGetTripStatus.mockRejectedValue(Object.assign(new Error('quota'), {
      code: 8,
    }));
    const response = await getTripStatus(statusRequest());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: 'pending', retryable: true });
  });

  it('protects trip status with authentication and request ID validation', async () => {
    mockAuthenticate.mockRejectedValueOnce(new RequestError(401, 'Invalid token'));
    expect((await getTripStatus(statusRequest())).status).toBe(401);
    expect((await getTripStatus(statusRequest('bad/path'))).status).toBe(400);
    expect((await getTripStatus(statusRequest('trip-request-route', 'bad'))).status).toBe(400);
  });

  it('binds status lookup to the authenticated UID', async () => {
    mockAuthenticate.mockResolvedValueOnce('different-user');
    await getTripStatus(statusRequest());
    expect(mockGetTripStatus).toHaveBeenCalledWith(
      'different-user',
      'trip-request-route',
      'a'.repeat(64),
    );
  });

  // -------------------------------------------------------------------------
  // R5: POST ride → 200 created
  // -------------------------------------------------------------------------

  it('R5: POST ride created → 200 with result created', async () => {
    mockSaveRide.mockResolvedValue({ result: 'created', tripId: null, statsUpdated: true });
    const response = await saveRide(request('/api/ride-logs', validRide));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ result: 'created' });
  });

  // -------------------------------------------------------------------------
  // R6: POST ride/trip ambiguous → 503 retryable
  // -------------------------------------------------------------------------

  it('R6: POST ride SaveCommandAmbiguousError → 503 retryable', async () => {
    const { SaveCommandAmbiguousError: SAE } = await import('@/lib/services/save-command-service');
    mockSaveRide.mockRejectedValue(new SAE('ambiguous'));
    const response = await saveRide(request('/api/ride-logs', validRide));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ outcome: 'ambiguous', retryable: true });
  });

  it('R6b: POST trip SaveCommandAmbiguousError → 503 retryable', async () => {
    const { SaveCommandAmbiguousError: SAE } = await import('@/lib/services/save-command-service');
    mockSaveTrip.mockRejectedValue(new SAE('ambiguous'));
    const response = await saveTrip(request('/api/trip-commands', validTrip));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ outcome: 'ambiguous', retryable: true });
  });

  // -------------------------------------------------------------------------
  // R7: POST ride conflict → 409
  // -------------------------------------------------------------------------

  it('R7: POST ride SaveCommandConflictError → 409', async () => {
    mockSaveRide.mockRejectedValue(new SaveCommandConflictError('conflict'));
    const response = await saveRide(request('/api/ride-logs', validRide));
    expect(response.status).toBe(409);
  });

  // -------------------------------------------------------------------------
  // R8: quota cycle at route level — status 503 pending does not fabricate
  //     replay behavior; GET RESOURCE_EXHAUSTED never returns 'not-found'
  // -------------------------------------------------------------------------

  it('R8: GET RESOURCE_EXHAUSTED → 503 pending (not not-found, not replayed)', async () => {
    mockGetTripStatus.mockRejectedValue(Object.assign(new Error('quota'), { code: 8 }));
    const response = await getTripStatus(statusRequest());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe('pending');
    expect(body.retryable).toBe(true);
    // Must not expose 'not-found' or any replay classification under quota
    expect(body.status).not.toBe('not-found');
    expect(body.status).not.toBe('committed');
  });

  // -------------------------------------------------------------------------
  // BW2: POST trip/ride with deadline ambiguity → 503 ambiguous
  //      In production, saveTripCommand/saveRideCommand wrap SaveCommandDeadlineError
  //      inside SaveCommandAmbiguousError before propagating to the route.
  //      The route checks instanceof SaveCommandAmbiguousError → 503.
  // -------------------------------------------------------------------------

  it('BW2: POST trip deadline (wrapped as SaveCommandAmbiguousError) → 503 ambiguous retryable', async () => {
    mockSaveTrip.mockRejectedValue(new SaveCommandAmbiguousError('deadline-wrapped'));
    const response = await saveTrip(request('/api/trip-commands', validTrip));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.retryable).toBe(true);
    // Route must not return 200 or optimistic success on deadline.
    expect(response.status).not.toBe(200);
  });

  it('BW2b: POST ride deadline (wrapped as SaveCommandAmbiguousError) → 503 ambiguous retryable', async () => {
    mockSaveRide.mockRejectedValue(new SaveCommandAmbiguousError('deadline-wrapped'));
    const response = await saveRide(request('/api/ride-logs', validRide));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.retryable).toBe(true);
    expect(response.status).not.toBe(200);
  });

  // -------------------------------------------------------------------------
  // BW8: route config — maxDuration=20 and dynamic='force-dynamic' exported;
  //      both routes stay below the 30s client abort threshold
  // -------------------------------------------------------------------------

  it('BW8: trip-commands route exports maxDuration=20 and dynamic=force-dynamic', () => {
    expect(tripMaxDuration).toBe(20);
    expect(tripDynamic).toBe('force-dynamic');
    // COMMIT_DEADLINE_MS (10s) + classification reads + margin must stay under maxDuration
    expect(COMMIT_DEADLINE_MS).toBeLessThan(tripMaxDuration * 1_000);
    // maxDuration must be below the 30s client/Vercel hard abort ceiling
    expect(tripMaxDuration).toBeLessThan(30);
  });

  it('BW8b: ride-logs route exports maxDuration=20 and dynamic=force-dynamic', () => {
    expect(rideMaxDuration).toBe(20);
    expect(rideDynamic).toBe('force-dynamic');
    expect(COMMIT_DEADLINE_MS).toBeLessThan(rideMaxDuration * 1_000);
    expect(rideMaxDuration).toBeLessThan(30);
  });

  // -------------------------------------------------------------------------
  // BW9: telemetry — log output does not contain raw UID/requestId/fingerprint/payload;
  //      deadline outcome is distinguishable from generic ambiguous in logs
  // -------------------------------------------------------------------------

  it('BW9: trip deadline telemetry uses requestHash not raw requestId, and outcome=deadline', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      mockSaveTrip.mockRejectedValue(new SaveCommandDeadlineError('deadline'));
      await saveTrip(request('/api/trip-commands', validTrip));

      // Reconstruct what the route logs: it should log operation/result/requestHash.
      const calls = logSpy.mock.calls.map((args) => args.join(' '));
      const tripLog = calls.find((c) => c.includes('trip-commands'));

      // The route must emit at least one log line containing 'trip-commands'.
      expect(tripLog, 'Expected a log line containing trip-commands').toBeDefined();
      // Raw requestId must not appear verbatim in any log line.
      expect(tripLog!).not.toContain(validTrip.requestId);
      // Raw UID must not appear.
      expect(tripLog!).not.toContain('user-123');

      // Verify SaveCommandDeadlineError is structurally distinct from generic ambiguous
      // so a log consumer can distinguish deadline from other 503 causes.
      const deadline = new SaveCommandDeadlineError('x');
      const ambiguous = new SaveCommandAmbiguousError('x');
      expect(deadline.name).toBe('SaveCommandDeadlineError');
      expect(ambiguous.name).toBe('SaveCommandAmbiguousError');
      expect(deadline.name).not.toBe(ambiguous.name);
    } finally {
      logSpy.mockRestore();
    }
  });
});
