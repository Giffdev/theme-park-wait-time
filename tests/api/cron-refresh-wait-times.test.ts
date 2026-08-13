import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getConfiguredParkIds: vi.fn(),
  refreshParksBounded: vi.fn(),
}));

vi.mock('@/lib/wait-times/refresh', () => ({
  getConfiguredParkIds: mocks.getConfiguredParkIds,
  refreshParksBounded: mocks.refreshParksBounded,
}));

import { GET } from '@/app/api/cron/refresh-wait-times/route';

function request(authorization?: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/refresh-wait-times', {
    headers: authorization ? { authorization } : undefined,
  });
}

describe('GET /api/cron/refresh-wait-times', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL_ENV', 'preview');
    mocks.getConfiguredParkIds.mockResolvedValue({
      supported: ['park-a', 'park-b', 'park-c'],
      unsupported: ['unsupported-park'],
    });
    mocks.refreshParksBounded.mockResolvedValue([
      {
        parkId: 'park-a',
        status: 'fresh',
        source: 'upstream',
        fetchedAt: '2026-08-11T20:00:00.000Z',
      },
      {
        parkId: 'park-b',
        status: 'stale',
        source: 'firestore-cache',
        fetchedAt: '2026-08-11T19:55:00.000Z',
      },
      {
        parkId: 'park-c',
        status: 'failed',
        error: 'Wait-time provider and persistent cache are unavailable.',
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, 'Bearer wrong-secret'])(
    'rejects an unauthorized request (%s)',
    async (authorization) => {
      const response = await GET(request(authorization));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
      expect(mocks.getConfiguredParkIds).not.toHaveBeenCalled();
      expect(mocks.refreshParksBounded).not.toHaveBeenCalled();
    },
  );

  it('fails closed in production when the cron secret is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Cron secret is not configured' });
    expect(mocks.refreshParksBounded).not.toHaveBeenCalled();
  });

  it('allows an explicit no-secret invocation in local and test environments', async () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'test');

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.refreshParksBounded).toHaveBeenCalledOnce();
  });

  it('refreshes only configured supported parks with bounded concurrency', async () => {
    const response = await GET(request('Bearer test-cron-secret'));

    expect(response.status).toBe(200);
    expect(mocks.refreshParksBounded).toHaveBeenCalledWith(
      ['park-a', 'park-b', 'park-c'],
      6,
      { awaitMaintenance: true },
    );
    expect(mocks.refreshParksBounded).not.toHaveBeenCalledWith(
      expect.arrayContaining(['unsupported-park']),
      expect.anything(),
      expect.anything(),
    );
  });

  it('reports partial failures without discarding successful park results', async () => {
    const response = await GET(request('Bearer test-cron-secret'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(data).toEqual(expect.objectContaining({
      ok: false,
      total: 3,
      refreshed: 1,
      stale: 1,
      failed: 1,
      startedAt: expect.any(String),
      completedAt: expect.any(String),
    }));
    expect(data.results).toEqual([
      expect.objectContaining({ parkId: 'park-a', status: 'fresh', source: 'upstream' }),
      expect.objectContaining({ parkId: 'park-b', status: 'stale', source: 'firestore-cache' }),
      expect.objectContaining({ parkId: 'park-c', status: 'failed', error: expect.any(String) }),
    ]);
  });
});
