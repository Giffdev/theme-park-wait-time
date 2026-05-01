/**
 * Tests for useVisibility hook.
 *
 * Tests the low-level visibility detection layer that fires a callback
 * when the document becomes visible (tab switch, phone unlock, app resume).
 *
 * Written test-first from Mikey's architecture spec (2026-05-01).
 * The hook may not exist yet — Data is building it concurrently.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useVisibility } from '../useVisibility';

// Helper: simulate visibilitychange event
function fireVisibilityChange(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    writable: true,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

// Helper: simulate focus event (iOS fallback)
function fireFocusEvent() {
  window.dispatchEvent(new Event('focus'));
}

describe('useVisibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Start with document visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('fires callback when document becomes visible', () => {
    const onVisible = vi.fn();
    renderHook(() => useVisibility(onVisible));

    // Go hidden first, then visible
    fireVisibilityChange('hidden');
    vi.advanceTimersByTime(6000); // exceed debounce
    fireVisibilityChange('visible');

    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when document becomes hidden', () => {
    const onVisible = vi.fn();
    renderHook(() => useVisibility(onVisible));

    fireVisibilityChange('hidden');

    expect(onVisible).not.toHaveBeenCalled();
  });

  it('debounces rapid visibility changes (hidden→visible within 5s = skip)', () => {
    const onVisible = vi.fn();
    renderHook(() => useVisibility(onVisible));

    // Go hidden
    fireVisibilityChange('hidden');
    // Come back within 5 seconds (rapid alt-tab)
    vi.advanceTimersByTime(3000); // 3s < 5s debounce
    fireVisibilityChange('visible');

    expect(onVisible).not.toHaveBeenCalled();
  });

  it('fires callback after debounce period elapses', () => {
    const onVisible = vi.fn();
    renderHook(() => useVisibility(onVisible));

    // Go hidden
    fireVisibilityChange('hidden');
    // Wait past the debounce threshold (5s default)
    vi.advanceTimersByTime(5001);
    // Come back
    fireVisibilityChange('visible');

    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('respects custom debounceMs option', () => {
    const onVisible = vi.fn();
    renderHook(() => useVisibility(onVisible, { debounceMs: 10000 }));

    fireVisibilityChange('hidden');
    vi.advanceTimersByTime(7000); // 7s < custom 10s
    fireVisibilityChange('visible');

    expect(onVisible).not.toHaveBeenCalled();

    // Now test that it fires after 10s
    fireVisibilityChange('hidden');
    vi.advanceTimersByTime(10001);
    fireVisibilityChange('visible');

    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('iOS fallback: fires on window focus event', () => {
    const onVisible = vi.fn();
    renderHook(() => useVisibility(onVisible));

    // Simulate being away long enough
    fireVisibilityChange('hidden');
    vi.advanceTimersByTime(6000);

    // iOS Safari fires focus instead of visibilitychange
    fireFocusEvent();

    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('cleans up event listeners on unmount', () => {
    const onVisible = vi.fn();
    const removeDocSpy = vi.spyOn(document, 'removeEventListener');
    const removeWinSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useVisibility(onVisible));
    unmount();

    expect(removeDocSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    );
    expect(removeWinSpy).toHaveBeenCalledWith('focus', expect.any(Function));

    removeDocSpy.mockRestore();
    removeWinSpy.mockRestore();
  });

  it('does not fire on focus if debounce period has not elapsed', () => {
    const onVisible = vi.fn();
    renderHook(() => useVisibility(onVisible));

    fireVisibilityChange('hidden');
    vi.advanceTimersByTime(2000); // within debounce
    fireFocusEvent();

    expect(onVisible).not.toHaveBeenCalled();
  });
});
