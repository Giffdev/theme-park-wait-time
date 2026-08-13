/**
 * Contract: /api/wait-times responses must carry useful, secret-free
 * Server-Timing/telemetry headers describing request stages (e.g. upstream
 * fetch, blend, Firestore write), and the existing JSON API contract fields
 * must remain unchanged as that telemetry is added.
 *
 * This file intentionally locks the *public* JSON contract shape (so a
 * telemetry-focused change can't accidentally also change response fields)
 * alongside the new Server-Timing expectations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockUpdateForecastAggregates = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockBatch = { set: mockBatchSet, commit: mockBatchCommit };
const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/admin', () => ({
  adminApp: { name: 'mock-app' },
  adminDb: {
    batch: () => mockBatch,
    collection: () => {
      const mock: Record<string, unknown> = {};
      mock.doc = vi.fn().mockReturnValue(mock);
      mock.collection = vi.fn().mockReturnValue(mock);
      mock.get = mockGet;
      mock.id = 'mock-doc';
      return mock;
    },
    getAll: (...refs: unknown[]) => Promise.resolve(refs.map(() => ({ exists: false }))),
  },
}));

vi.mock('@/lib/forecast/aggregation', () => ({
  updateForecastAggregates: mockUpdateForecastAggregates,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { GET } from '@/app/api/wait-times/route';

const MAGIC_KINGDOM_ID = '75ea578a-adc8-4116-a54d-dccb60765ef9';
const LIVE_ENTRY = {
  id: 'test-attraction',
  name: 'Test Attraction',
  entityType: 'ATTRACTION',
  status: 'OPERATING',
  queue: { STANDBY: { waitTime: 20 } },
};

// Secret-shaped values that must never leak into any response header,
// regardless of which stage names/timings are added.
const FORBIDDEN_HEADER_SUBSTRINGS = ['CRON_SECRET', 'service-account', 'private_key', 'sk_', 'Bearer '];

function request(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/wait-times?parkId=${MAGIC_KINGDOM_ID}`);
}

describe('GET /api/wait-times — telemetry headers and contract stability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'super-secret-cron-value');
    mockGet.mockResolvedValue({ docs: [] });
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ liveData: [LIVE_ENTRY] }) });
  });

  it('includes a Server-Timing header naming useful request stages', async () => {
    const response = await GET(request());

    const serverTiming = response.headers.get('server-timing');
    expect(serverTiming).toEqual(expect.any(String));

    // At minimum, the upstream fetch stage should be identifiable so
    // operators can distinguish "upstream was slow" from "our write was
    // slow" from "our blend step was slow" when diagnosing latency/504s.
    expect(serverTiming).toMatch(/upstream/i);
  });

  it('never leaks secret-shaped values through any response header', async () => {
    const response = await GET(request());

    const allHeaderText = Array.from(response.headers.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    for (const forbidden of FORBIDDEN_HEADER_SUBSTRINGS) {
      expect(allHeaderText).not.toContain(forbidden);
    }
    expect(allHeaderText).not.toContain('super-secret-cron-value');
  });

  it('preserves the existing top-level JSON contract fields unchanged', async () => {
    const response = await GET(request());
    const data = await response.json();

    // Locks the public contract: adding telemetry/CDN headers must not add,
    // rename, or remove these top-level response fields.
    expect(Object.keys(data).sort()).toEqual(
      ['fetchedAt', 'parkMeta', 'parks', 'stale'].sort(),
    );
    expect(data).toEqual({
      fetchedAt: expect.any(String),
      stale: false,
      parkMeta: {
        [MAGIC_KINGDOM_ID]: {
          stale: false,
          source: 'upstream',
          fetchedAt: expect.any(String),
          ageSeconds: expect.any(Number),
        },
      },
      parks: {
        [MAGIC_KINGDOM_ID]: [
          expect.objectContaining({ attractionId: 'test-attraction', waitMinutes: 20 }),
        ],
      },
    });
  });
});
