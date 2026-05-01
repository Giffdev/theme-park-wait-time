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
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
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

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>).__visibilityCallback = undefined;
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
});
