import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockAuthenticate = vi.fn();
const mockSaveRide = vi.fn();
const mockSaveTrip = vi.fn();

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
  return {
    SaveCommandAmbiguousError,
    SaveCommandConflictError,
    saveRideCommand: (...args: unknown[]) => mockSaveRide(...args),
    saveTripCommand: (...args: unknown[]) => mockSaveTrip(...args),
  };
});

import { POST as saveRide } from '@/app/api/ride-logs/route';
import { POST as saveTrip } from '@/app/api/trip-commands/route';
import { RequestError } from '@/lib/server/authenticated-json';

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
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
});
