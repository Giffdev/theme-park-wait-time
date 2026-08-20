import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AllParksWaitTimesResponse } from '@/lib/wait-times/client';

const useAutoRefreshMock = vi.hoisted(() => vi.fn());

vi.mock('../useAutoRefresh', () => ({
  useAutoRefresh: useAutoRefreshMock,
}));

import {
  ALL_PARKS_REFRESH_INTERVAL_MS,
  useAllParksAutoRefresh,
} from '../useAllParksAutoRefresh';

const autoRefreshResult = {
  isBackgroundRefreshing: false,
  isInitialRefreshing: false,
  lastRefreshedAt: null,
  lastRefreshError: null,
  forceRefresh: vi.fn(),
};

const snapshot: AllParksWaitTimesResponse = {
  fetchedAt: '2026-08-20T02:55:00.000Z',
  stale: false,
  parkMeta: {
    park: {
      stale: false,
      source: 'upstream',
      fetchedAt: '2026-08-20T02:54:59.000Z',
      ageSeconds: 0,
    },
  },
  parks: {
    park: [
      {
        attractionId: 'ride',
        attractionName: 'Ride',
        status: 'OPERATING',
        waitMinutes: 20,
        fetchedAt: '2026-08-20T02:54:59.000Z',
      },
    ],
  },
};

const recoveredSnapshot: AllParksWaitTimesResponse = {
  fetchedAt: '2026-08-20T03:05:00.000Z',
  stale: false,
  parkMeta: {
    park: {
      stale: false,
      source: 'upstream',
      fetchedAt: '2026-08-20T03:04:59.000Z',
      ageSeconds: 0,
    },
  },
  parks: {
    park: [
      {
        attractionId: 'ride',
        attractionName: 'Ride',
        status: 'OPERATING',
        waitMinutes: 18,
        fetchedAt: '2026-08-20T03:04:59.000Z',
      },
    ],
  },
};

describe('useAllParksAutoRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAutoRefreshMock.mockReturnValue(autoRefreshResult);
  });

  it('uses the approved scheduler with the bounded all-parks cadence', () => {
    renderHook(() =>
      useAllParksAutoRefresh({
        enabled: true,
        initialDataAge: Number.POSITIVE_INFINITY,
      })
    );

    expect(useAutoRefreshMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'all-parks-provider',
        staleness: ALL_PARKS_REFRESH_INTERVAL_MS,
        pollIntervalMs: ALL_PARKS_REFRESH_INTERVAL_MS,
        enabled: true,
        initialDataAge: Number.POSITIVE_INFINITY,
        onRefresh: expect.any(Function),
      })
    );
    expect(ALL_PARKS_REFRESH_INTERVAL_MS).toBe(10 * 60 * 1000);
  });

  it('exposes the scheduler arrival phase as initial provider hydration', () => {
    useAutoRefreshMock.mockReturnValue({
      ...autoRefreshResult,
      isBackgroundRefreshing: true,
      isInitialRefreshing: true,
    });

    const { result } = renderHook(() =>
      useAllParksAutoRefresh({
        initialDataAge: Number.POSITIVE_INFINITY,
      })
    );

    expect(result.current.isBackgroundRefreshing).toBe(true);
    expect(result.current.isInitialHydrating).toBe(true);
  });

  it('calls the shared server provider path and publishes its truthful metadata', async () => {
    const onSnapshot = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => snapshot,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useAllParksAutoRefresh({
        initialDataAge: 15 * 60 * 1000,
        onSnapshot,
      })
    );
    const refresh = useAutoRefreshMock.mock.calls[0][0].onRefresh as () => Promise<void>;

    await act(async () => {
      await refresh();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/wait-times', {
      signal: expect.any(AbortSignal),
    });
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
    expect(result.current.snapshot).toEqual(snapshot);
  });

  it('returns the provider snapshot timestamp instead of the local completion time', async () => {
    const onSnapshot = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...snapshot,
        fetchedAt: '2026-08-20T03:00:00.000Z',
        parkMeta: {
          park: {
            ...snapshot.parkMeta.park,
            fetchedAt: '2026-08-20T02:54:59.000Z',
          },
          secondPark: {
            stale: false,
            source: 'upstream',
            fetchedAt: '2026-08-20T02:50:00.000Z',
            ageSeconds: 0,
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() =>
      useAllParksAutoRefresh({
        initialDataAge: 15 * 60 * 1000,
        onSnapshot,
      })
    );
    const refresh = useAutoRefreshMock.mock.calls[0][0].onRefresh as () => Promise<{ refreshedAt: number }>;

    let refreshResult!: { refreshedAt: number };
    await act(async () => {
      refreshResult = await refresh();
    });

    expect(refreshResult).toEqual({
      refreshedAt: new Date('2026-08-20T02:50:00.000Z').getTime(),
    });
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchedAt: '2026-08-20T03:00:00.000Z',
      })
    );
  });

  it('coalesces concurrent surface refreshes and ignores completion after unmount', async () => {
    let resolveResponse!: (value: unknown) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveResponse = resolve;
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const firstConsumer = vi.fn();
    const secondConsumer = vi.fn();

    const first = renderHook(() =>
      useAllParksAutoRefresh({ initialDataAge: 0, onSnapshot: firstConsumer })
    );
    const second = renderHook(() =>
      useAllParksAutoRefresh({ initialDataAge: 0, onSnapshot: secondConsumer })
    );
    const firstRefresh = useAutoRefreshMock.mock.calls[0][0].onRefresh as () => Promise<void>;
    const secondRefresh = useAutoRefreshMock.mock.calls[1][0].onRefresh as () => Promise<void>;

    const firstPromise = firstRefresh();
    const secondPromise = secondRefresh();
    first.unmount();

    resolveResponse({
      ok: true,
      status: 200,
      json: async () => snapshot,
    });
    await act(async () => {
      await Promise.all([firstPromise, secondPromise]);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstConsumer).not.toHaveBeenCalled();
    expect(secondConsumer).toHaveBeenCalledWith(snapshot);
    second.unmount();
  });

  it('keeps the last good snapshot visible after a failed refresh and recovers on a later success', async () => {
    const onSnapshot = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => snapshot,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ message: 'temporarily unavailable' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => recoveredSnapshot,
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useAllParksAutoRefresh({
        initialDataAge: 15 * 60 * 1000,
        onSnapshot,
      })
    );
    const refresh = useAutoRefreshMock.mock.calls[0][0].onRefresh as () => Promise<void>;

    await act(async () => {
      await refresh();
    });
    expect(result.current.snapshot).toEqual(snapshot);
    expect(onSnapshot).toHaveBeenCalledTimes(1);

    await expect(refresh()).rejects.toThrow('Wait-time refresh failed with status 503');
    expect(result.current.snapshot).toEqual(snapshot);
    expect(onSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      await refresh();
    });

    expect(result.current.snapshot).toEqual(recoveredSnapshot);
    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(onSnapshot).toHaveBeenLastCalledWith(recoveredSnapshot);
  });
});
