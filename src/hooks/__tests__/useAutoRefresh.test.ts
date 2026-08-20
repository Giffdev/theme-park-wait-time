/**
 * Tests for useAutoRefresh hook.
 *
 * Tests the staleness-aware auto-refresh logic that fires when the
 * page becomes visible and data is older than the configured threshold.
 *
 * Written test-first from Mikey's architecture spec (2026-05-01).
 * The hook may not exist yet — Data is building it concurrently.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useAutoRefresh } from '../useAutoRefresh';

// Mock useVisibility — we test it separately, here we just simulate its callback
vi.mock('../useVisibility', () => ({
  useVisibility: (onVisible: () => void, _options?: unknown) => {
    // Store the callback so tests can invoke it
    (globalThis as Record<string, unknown>).__visibilityCallback = onVisible;
  },
}));

function simulateVisible() {
  const cb = (globalThis as Record<string, unknown>).__visibilityCallback as
    | (() => void)
    | undefined;
  if (cb) cb();
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    writable: true,
    configurable: true,
  });
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    value: online,
    configurable: true,
  });
}

function fireOnlineEvent() {
  window.dispatchEvent(new Event('online'));
}

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>).__visibilityCallback = undefined;
    setVisibility('visible');
    setOnline(true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('calls onRefresh when data is stale and page becomes visible', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useAutoRefresh({
        key: 'test-data',
        staleness: 2 * 60 * 1000, // 2 min
        onRefresh,
        enabled: true,
      })
    );

    // Advance time past staleness threshold
    vi.advanceTimersByTime(3 * 60 * 1000);

    // Simulate user returning to tab
    await act(async () => {
      simulateVisible();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onRefresh when data is fresh', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAutoRefresh({
        key: 'test-fresh',
        staleness: 5 * 60 * 1000, // 5 min
        onRefresh,
        enabled: true,
      })
    );

    // Establish a baseline refresh timestamp
    await act(async () => {
      await result.current.forceRefresh();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    onRefresh.mockClear();

    // Only 1 minute has passed — data is still fresh
    vi.advanceTimersByTime(60 * 1000);

    await act(async () => {
      simulateVisible();
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('anchors staleness to a source timestamp returned by a cached refresh', async () => {
    const sourceTimestamp = Date.now() - 3 * 60 * 1000;
    const onRefresh = vi.fn().mockResolvedValue({ refreshedAt: sourceTimestamp });

    const { result } = renderHook(() =>
      useAutoRefresh({
        key: 'source-timestamp',
        staleness: 2 * 60 * 1000,
        onRefresh,
        enabled: true,
      })
    );

    await act(async () => {
      await result.current.forceRefresh();
    });

    expect(result.current.lastRefreshedAt).toBe(sourceTimestamp);
    onRefresh.mockClear();

    await act(async () => {
      simulateVisible();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onRefresh when enabled=false', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useAutoRefresh({
        key: 'test-disabled',
        staleness: 2 * 60 * 1000,
        onRefresh,
        enabled: false,
      })
    );

    vi.advanceTimersByTime(10 * 60 * 1000); // way past staleness

    await act(async () => {
      simulateVisible();
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  describe('periodic polling', () => {
    it('uses the remaining freshness budget for the first poll', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      renderHook(() =>
        useAutoRefresh({
          key: 'poll-initial-freshness-budget',
          staleness: 1_000,
          pollIntervalMs: 1_000,
          onRefresh,
          enabled: true,
          initialDataAge: 400,
        })
      );

      await act(async () => {
        vi.advanceTimersByTime(599);
      });
      expect(onRefresh).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('re-anchors the first poll when the active key receives its initial age after enabling', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      const { rerender } = renderHook(
        ({ enabled, age }: { enabled: boolean; age: number | null }) =>
          useAutoRefresh({
            key: 'poll-delayed-initial-age',
            staleness: 1_000,
            pollIntervalMs: 1_000,
            onRefresh,
            enabled,
            initialDataAge: age,
          }),
        { initialProps: { enabled: false, age: null } }
      );

      rerender({ enabled: true, age: null });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(onRefresh).not.toHaveBeenCalled();

      rerender({ enabled: true, age: 900 });

      await act(async () => {
        vi.advanceTimersByTime(99);
      });
      expect(onRefresh).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('does not reset the first poll when a concrete initial age changes on an unrelated render', () => {
      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      const { rerender } = renderHook(
        ({ age }: { age: number }) =>
          useAutoRefresh({
            key: 'poll-stable-concrete-age',
            staleness: 1_000,
            pollIntervalMs: 1_000,
            onRefresh,
            enabled: true,
            initialDataAge: age,
          }),
        { initialProps: { age: 400 } }
      );

      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(clearTimeoutSpy).not.toHaveBeenCalled();

      rerender({ age: 500 });

      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(clearTimeoutSpy).not.toHaveBeenCalled();

      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    });

    it('does not burst when a delayed initial age is already stale', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      const { rerender } = renderHook(
        ({ age }: { age: number | null }) =>
          useAutoRefresh({
            key: 'poll-delayed-stale-age',
            staleness: 1_000,
            pollIntervalMs: 1_000,
            onRefresh,
            enabled: true,
            initialDataAge: age,
          }),
        { initialProps: { age: null } }
      );

      await act(async () => {
        rerender({ age: 1_000 });
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(999);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(onRefresh).toHaveBeenCalledTimes(2);
    });

    it('uses the full initial cadence when cached-data age is unknown', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      renderHook(() =>
        useAutoRefresh({
          key: 'poll-unknown-initial-age',
          staleness: 1_000,
          pollIntervalMs: 1_000,
          onRefresh,
          enabled: true,
        })
      );

      await act(async () => {
        vi.advanceTimersByTime(999);
      });
      expect(onRefresh).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('refreshes once after the cadence while the page stays visible and online', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      renderHook(() =>
        useAutoRefresh({
          key: 'poll-visible-online',
          staleness: 2_000,
          pollIntervalMs: 1_000,
          onRefresh,
          enabled: true,
          initialDataAge: 1_000,
        })
      );

      await act(async () => {
        vi.advanceTimersByTime(999);
      });
      expect(onRefresh).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('schedules the next poll from refresh completion when refresh has non-zero latency', async () => {
      const onRefresh = vi.fn()
        .mockImplementationOnce(
          () => new Promise<void>((resolve) => {
            window.setTimeout(resolve, 100);
          })
        )
        .mockResolvedValue(undefined);

      renderHook(() =>
        useAutoRefresh({
          key: 'poll-completion-cadence',
          staleness: 1_000,
          pollIntervalMs: 1_000,
          onRefresh,
          enabled: true,
          initialDataAge: 0,
        })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_100);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(999);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(onRefresh).toHaveBeenCalledTimes(2);
    });

    it('re-anchors the next poll after a mid-cycle manual forceRefresh without letting the old boundary fire', async () => {
      const onRefresh = vi.fn()
        .mockImplementationOnce(
          () => new Promise<void>((resolve) => {
            window.setTimeout(resolve, 100);
          })
        )
        .mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useAutoRefresh({
          key: 'poll-manual-reanchor',
          staleness: 1_000,
          pollIntervalMs: 1_000,
          onRefresh,
          enabled: true,
          initialDataAge: 0,
        })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      await act(async () => {
        const refreshPromise = result.current.forceRefresh();
        await vi.advanceTimersByTimeAsync(100);
        await refreshPromise;
      });

      expect(onRefresh).toHaveBeenCalledTimes(1);

      // The original t=1000 poll boundary must not fire after the manual refresh.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(599);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(onRefresh).toHaveBeenCalledTimes(2);
    });

    it('re-anchors the next poll when visibility catch-up refreshes mid-cycle', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);
      setVisibility('hidden');

      renderHook(() =>
        useAutoRefresh({
          key: 'poll-out-of-band-reanchor',
          staleness: 1_000,
          pollIntervalMs: 1_000,
          onRefresh,
          enabled: true,
          initialDataAge: 0,
        })
      );

      // The first hidden boundary no-ops and leaves an old timer at t=2000.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });
      expect(onRefresh).not.toHaveBeenCalled();

      setVisibility('visible');
      await act(async () => {
        simulateVisible();
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      // The old t=2000 boundary must not move the completion-anchored timer.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(499);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      // Exactly one interval after the t=1500 catch-up completion.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(onRefresh).toHaveBeenCalledTimes(2);
    });

    it('does not poll while hidden', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);
      setVisibility('hidden');

      renderHook(() =>
        useAutoRefresh({
          key: 'poll-hidden',
          staleness: 2_000,
          pollIntervalMs: 1_000,
          onRefresh,
          enabled: true,
          initialDataAge: 1_000,
        })
      );

      await act(async () => {
        vi.advanceTimersByTime(5_000);
      });

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('does not poll while offline', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);
      setOnline(false);

      renderHook(() =>
        useAutoRefresh({
          key: 'poll-offline',
          staleness: 2_000,
          pollIntervalMs: 1_000,
          onRefresh,
          enabled: true,
          initialDataAge: 1_000,
        })
      );

      await act(async () => {
        vi.advanceTimersByTime(5_000);
      });

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('catches up promptly when visibility and connectivity return and the data is stale', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);
      setVisibility('hidden');
      setOnline(false);

      renderHook(() =>
        useAutoRefresh({
          key: 'poll-return',
          staleness: 2_000,
          pollIntervalMs: 1_000,
          onRefresh,
          enabled: true,
          initialDataAge: 1_000,
        })
      );

      await act(async () => {
        vi.advanceTimersByTime(5_000);
      });
      expect(onRefresh).not.toHaveBeenCalled();

      setVisibility('visible');
      setOnline(true);
      await act(async () => {
        fireOnlineEvent();
        simulateVisible();
      });

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('does not start a second refresh while the previous periodic refresh is still in flight', async () => {
      let resolveRefresh!: () => void;
      const onRefresh = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        })
      );

      renderHook(() =>
        useAutoRefresh({
          key: 'poll-inflight',
          staleness: 2_000,
          pollIntervalMs: 1_000,
          onRefresh,
          enabled: true,
          initialDataAge: 1_000,
        })
      );

      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(5_000);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveRefresh!();
      });
    });

    it('cleans up timer and connectivity listeners when the key changes or unmounts', () => {
      const addListenerSpy = vi.spyOn(window, 'addEventListener');
      const removeListenerSpy = vi.spyOn(window, 'removeEventListener');
      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      const { rerender, unmount } = renderHook(
        ({ dataKey }: { dataKey: string }) =>
          useAutoRefresh({
            key: dataKey,
            staleness: 2_000,
            pollIntervalMs: 1_000,
            onRefresh,
            enabled: true,
            initialDataAge: 1_000,
          }),
        { initialProps: { dataKey: 'poll-a' } }
      );

      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(addListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(addListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

      rerender({ dataKey: 'poll-b' });

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(removeListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(removeListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
      expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
      expect(addListenerSpy.mock.calls.filter(([event]) => (
        event === 'online' || event === 'offline'
      ))).toHaveLength(4);

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
      expect(removeListenerSpy.mock.calls.filter(([event]) => (
        event === 'online' || event === 'offline'
      ))).toHaveLength(4);

      addListenerSpy.mockRestore();
      removeListenerSpy.mockRestore();
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    });
  });

  it('preserves visibility refreshes for non-poll callers while initial data age is unresolved', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useAutoRefresh({
        key: 'parks-style-unresolved-age',
        staleness: 10 * 60 * 1000,
        onRefresh,
        enabled: true,
        initialDataAge: null,
      })
    );

    await act(async () => {
      simulateVisible();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('no-ops on a visibility return while offline instead of attempting a doomed refresh', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    setOnline(false);

    renderHook(() =>
      useAutoRefresh({
        key: 'parks-style-offline-visibility-noop',
        staleness: 500,
        onRefresh,
        enabled: true,
        initialDataAge: 0,
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(600);
      simulateVisible();
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  describe('staleness thresholds per data type', () => {
    const thresholds = [
      { name: 'wait times', staleness: 2 * 60 * 1000 },
      { name: 'user trips', staleness: 5 * 60 * 1000 },
      { name: 'park list', staleness: 10 * 60 * 1000 },
      { name: 'park schedule', staleness: 30 * 60 * 1000 },
      { name: 'crowd calendar', staleness: 60 * 60 * 1000 },
    ];

    thresholds.forEach(({ name, staleness }) => {
      it(`respects ${name} threshold (${staleness / 60000}min) — stale triggers refresh`, async () => {
        const onRefresh = vi.fn().mockResolvedValue(undefined);

        renderHook(() =>
          useAutoRefresh({
            key: `test-${name}`,
            staleness,
            onRefresh,
            enabled: true,
          })
        );

        // Advance just past staleness
        vi.advanceTimersByTime(staleness + 1000);

        await act(async () => {
          simulateVisible();
        });

        expect(onRefresh).toHaveBeenCalledTimes(1);
      });

      it(`respects ${name} threshold (${staleness / 60000}min) — fresh skips refresh`, async () => {
        const onRefresh = vi.fn().mockResolvedValue(undefined);

        const { result } = renderHook(() =>
          useAutoRefresh({
            key: `test-${name}-fresh`,
            staleness,
            onRefresh,
            enabled: true,
          })
        );

        // First, force a refresh to establish lastRefreshedAt
        await act(async () => {
          await result.current.forceRefresh();
        });
        expect(onRefresh).toHaveBeenCalledTimes(1);
        onRefresh.mockClear();

        // Advance to just under staleness — data is still fresh
        vi.advanceTimersByTime(staleness - 1000);

        await act(async () => {
          simulateVisible();
        });

        expect(onRefresh).not.toHaveBeenCalled();
      });
    });
  });

  it('does NOT double-fire if refresh already in progress', async () => {
    let resolveRefresh: () => void;
    const onRefresh = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolveRefresh = resolve; })
    );

    renderHook(() =>
      useAutoRefresh({
        key: 'test-inflight',
        staleness: 2 * 60 * 1000,
        onRefresh,
        enabled: true,
      })
    );

    vi.advanceTimersByTime(3 * 60 * 1000);

    // First visibility change triggers refresh
    await act(async () => {
      simulateVisible();
    });

    // Second visibility change while first is still in progress
    await act(async () => {
      simulateVisible();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);

    // Resolve the first refresh
    await act(async () => {
      resolveRefresh!();
    });
  });

  it('updates lastRefreshedAt after successful refresh', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAutoRefresh({
        key: 'test-timestamp',
        staleness: 2 * 60 * 1000,
        onRefresh,
        enabled: true,
      })
    );

    vi.advanceTimersByTime(3 * 60 * 1000);

    await act(async () => {
      simulateVisible();
    });

    // After refresh completes, lastRefreshedAt should be updated
    expect(result.current.lastRefreshedAt).not.toBeNull();
    expect(result.current.lastRefreshedAt).toBeGreaterThan(0);
  });

  it('sets isBackgroundRefreshing during refresh', async () => {
    let resolveRefresh: () => void;
    const onRefresh = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolveRefresh = resolve; })
    );

    const { result } = renderHook(() =>
      useAutoRefresh({
        key: 'test-loading',
        staleness: 2 * 60 * 1000,
        onRefresh,
        enabled: true,
      })
    );

    expect(result.current.isBackgroundRefreshing).toBe(false);

    vi.advanceTimersByTime(3 * 60 * 1000);

    await act(async () => {
      simulateVisible();
    });

    // During refresh, flag should be true
    expect(result.current.isBackgroundRefreshing).toBe(true);

    // Complete the refresh
    await act(async () => {
      resolveRefresh!();
    });

    expect(result.current.isBackgroundRefreshing).toBe(false);
  });

  it('handles refresh errors silently (no throw)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onRefresh = vi.fn().mockRejectedValue(new Error('Network fail'));

    const { result } = renderHook(() =>
      useAutoRefresh({
        key: 'test-error',
        staleness: 2 * 60 * 1000,
        onRefresh,
        enabled: true,
      })
    );

    vi.advanceTimersByTime(3 * 60 * 1000);

    // Should not throw
    await act(async () => {
      simulateVisible();
    });

    // Hook should recover gracefully
    expect(result.current.isBackgroundRefreshing).toBe(false);
    // Error may be logged to console but never thrown to user
    consoleSpy.mockRestore();
  });

  it('forceRefresh works regardless of staleness', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAutoRefresh({
        key: 'test-force',
        staleness: 30 * 60 * 1000, // 30 min — data is very fresh
        onRefresh,
        enabled: true,
      })
    );

    // Don't advance time at all — data is as fresh as possible

    await act(async () => {
      await result.current.forceRefresh();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.lastRefreshedAt).not.toBeNull();
  });

  it('forceRefresh propagates errors so manual refresh UI can report them', async () => {
    const failure = new Error('Manual refresh failed');
    const onRefresh = vi.fn().mockRejectedValue(failure);

    const { result } = renderHook(() =>
      useAutoRefresh({
        key: 'test-force-error',
        staleness: 2 * 60 * 1000,
        onRefresh,
        enabled: true,
      })
    );

    await expect(act(async () => {
      await result.current.forceRefresh();
    })).rejects.toBe(failure);
    expect(result.current.lastRefreshError).toBeNull();
  });

  it('forceRefresh respects enabled flag (does not fire when disabled)', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAutoRefresh({
        key: 'test-force-disabled',
        staleness: 2 * 60 * 1000,
        onRefresh,
        enabled: false,
      })
    );

    await act(async () => {
      await result.current.forceRefresh();
    });

    // Implementation guards forceRefresh behind enabled too
    expect(onRefresh).not.toHaveBeenCalled();
  });

  describe('initial-arrival refresh (mount-time staleness)', () => {
    it('refreshes immediately on mount when cached data is already stale', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      await act(async () => {
        renderHook(() =>
          useAutoRefresh({
            key: 'arrival-stale',
            staleness: 2 * 60 * 1000,
            onRefresh,
            enabled: true,
            initialDataAge: 5 * 60 * 1000, // cached data is 5 min old — stale
          })
        );
      });

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('preserves stale arrival refresh for a non-poll caller mounted hidden', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);
      setVisibility('hidden');

      await act(async () => {
        renderHook(() =>
          useAutoRefresh({
            key: 'arrival-stale-hidden-non-poll',
            staleness: 2 * 60 * 1000,
            onRefresh,
            enabled: true,
            initialDataAge: 5 * 60 * 1000,
          })
        );
      });

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('preserves stale arrival refresh for a non-poll caller mounted offline', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);
      setOnline(false);

      await act(async () => {
        renderHook(() =>
          useAutoRefresh({
            key: 'arrival-stale-offline-non-poll',
            staleness: 2 * 60 * 1000,
            onRefresh,
            enabled: true,
            initialDataAge: 5 * 60 * 1000,
          })
        );
      });

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('does NOT refresh on mount when cached data is still fresh', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      await act(async () => {
        renderHook(() =>
          useAutoRefresh({
            key: 'arrival-fresh',
            staleness: 10 * 60 * 1000,
            onRefresh,
            enabled: true,
            initialDataAge: 60 * 1000, // only 1 min old — fresh
          })
        );
      });

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('does not evaluate arrival staleness at all when initialDataAge is omitted (legacy behavior)', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      await act(async () => {
        renderHook(() =>
          useAutoRefresh({
            key: 'arrival-unused',
            staleness: 2 * 60 * 1000,
            onRefresh,
            enabled: true,
            // initialDataAge intentionally omitted
          })
        );
      });

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('waits for a real value when initialDataAge starts as null, then evaluates once available', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      const { rerender } = await (async () => {
        let utils!: ReturnType<typeof renderHook>;
        await act(async () => {
          utils = renderHook(
            ({ age }: { age: number | null }) =>
              useAutoRefresh({
                key: 'arrival-wait',
                staleness: 2 * 60 * 1000,
                onRefresh,
                enabled: true,
                initialDataAge: age,
              }),
            { initialProps: { age: null } }
          );
        });
        return utils;
      })();

      // Still waiting for a real value — no decision made yet
      expect(onRefresh).not.toHaveBeenCalled();

      await act(async () => {
        rerender({ age: 5 * 60 * 1000 }); // now stale
      });

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('does not double-fire when a visibility change happens immediately after an arrival refresh', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      await act(async () => {
        renderHook(() =>
          useAutoRefresh({
            key: 'arrival-dedup',
            staleness: 2 * 60 * 1000,
            onRefresh,
            enabled: true,
            initialDataAge: 5 * 60 * 1000, // stale on arrival
          })
        );
      });

      expect(onRefresh).toHaveBeenCalledTimes(1);

      // A visibility change fires right after mount — should be a no-op since
      // the in-flight guard/refreshed timestamp already covers this window.
      await act(async () => {
        simulateVisible();
      });

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('re-evaluates arrival staleness when the data key changes on client navigation', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      let rerender!: ReturnType<typeof renderHook>['rerender'];
      await act(async () => {
        ({ rerender } = renderHook(
          ({ dataKey }: { dataKey: string }) =>
            useAutoRefresh({
              key: dataKey,
              staleness: 2 * 60 * 1000,
              onRefresh,
              enabled: true,
              initialDataAge: 5 * 60 * 1000,
            }),
          { initialProps: { dataKey: 'park-a' } },
        ));
      });

      expect(onRefresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        rerender({ dataKey: 'park-b' });
      });

      expect(onRefresh).toHaveBeenCalledTimes(2);
    });

    it('respects enabled=false — no arrival refresh fires while disabled', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      await act(async () => {
        renderHook(() =>
          useAutoRefresh({
            key: 'arrival-disabled',
            staleness: 2 * 60 * 1000,
            onRefresh,
            enabled: false,
            initialDataAge: 10 * 60 * 1000,
          })
        );
      });

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('surfaces lastRefreshError when the arrival refresh fails, without throwing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const failure = new Error('Snapshot fetch failed');
      const onRefresh = vi.fn().mockRejectedValue(failure);

      let result!: ReturnType<typeof renderHook>['result'];
      await act(async () => {
        ({ result } = renderHook(() =>
          useAutoRefresh({
            key: 'arrival-error',
            staleness: 2 * 60 * 1000,
            onRefresh,
            enabled: true,
            initialDataAge: 5 * 60 * 1000,
          })
        ));
      });

      expect(result.current.lastRefreshError).toBe(failure);
      expect(result.current.isBackgroundRefreshing).toBe(false);
      consoleSpy.mockRestore();
    });

    it('clears lastRefreshError after a subsequent successful refresh', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onRefresh = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue(undefined);

      let result!: ReturnType<typeof renderHook>['result'];
      await act(async () => {
        ({ result } = renderHook(() =>
          useAutoRefresh({
            key: 'arrival-error-clear',
            staleness: 2 * 60 * 1000,
            onRefresh,
            enabled: true,
            initialDataAge: 5 * 60 * 1000,
          })
        ));
      });

      expect(result.current.lastRefreshError).not.toBeNull();

      await act(async () => {
        await result.current.forceRefresh();
      });

      expect(result.current.lastRefreshError).toBeNull();
      consoleSpy.mockRestore();
    });
  });
});
