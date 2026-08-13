/**
 * Validates the shape and thresholds of the wait-times cold-concurrent test
 * matrix (see `wait-times-cold-concurrent-matrix.ts`) without making any
 * network calls — this keeps the matrix definition itself under CI
 * regression protection (so thresholds can't silently drift or scenarios
 * can't silently disappear) while the actual HTTP-calling runner remains a
 * manual/CI-gated tool for a real preview/production URL.
 */
import { describe, expect, it } from 'vitest';
import { WAIT_TIMES_COLD_CONCURRENT_MATRIX } from './wait-times-cold-concurrent-matrix';

const REQUIRED_SCENARIO_IDS = [
  'single-cold',
  'warm-sequential',
  'four-way-same-park-concurrent',
  'no-parkid',
  'twenty-request-multi-park',
];

describe('wait-times cold-concurrent matrix definition', () => {
  it('defines exactly the required scenario set', () => {
    const ids = WAIT_TIMES_COLD_CONCURRENT_MATRIX.map((s) => s.id);
    expect(ids.sort()).toEqual([...REQUIRED_SCENARIO_IDS].sort());
  });

  it('every scenario has positive, sane timing and concurrency thresholds', () => {
    for (const scenario of WAIT_TIMES_COLD_CONCURRENT_MATRIX) {
      expect(scenario.requestCount).toBeGreaterThan(0);
      expect(scenario.concurrency).toBeGreaterThan(0);
      expect(scenario.concurrency).toBeLessThanOrEqual(scenario.requestCount);
      expect(scenario.totalBudgetMs).toBeGreaterThan(0);
      expect(scenario.perRequestBudgetMs).toBeGreaterThan(0);
      expect(scenario.acceptableStatuses.length).toBeGreaterThan(0);
      expect(scenario.requiresServerTiming).toBe(true);
    }
  });

  it('the four-way-same-park-concurrent scenario is actually concurrent', () => {
    const scenario = WAIT_TIMES_COLD_CONCURRENT_MATRIX.find(
      (s) => s.id === 'four-way-same-park-concurrent',
    )!;
    expect(scenario.concurrency).toBe(scenario.requestCount);
    expect(scenario.parkStrategy).toBe('same');
  });

  it('the no-parkid scenario is bounded, not scaled to an unbounded park count', () => {
    const scenario = WAIT_TIMES_COLD_CONCURRENT_MATRIX.find((s) => s.id === 'no-parkid')!;
    expect(scenario.parkStrategy).toBe('none');
    // 20s matches the current /api/wait-times maxDuration ceiling; the
    // no-parkId path must fit inside the function's own timeout budget.
    expect(scenario.totalBudgetMs).toBeLessThanOrEqual(20_000);
  });

  it('the twenty-request-multi-park scenario spans multiple parks at real concurrency', () => {
    const scenario = WAIT_TIMES_COLD_CONCURRENT_MATRIX.find(
      (s) => s.id === 'twenty-request-multi-park',
    )!;
    expect(scenario.requestCount).toBe(20);
    expect(scenario.concurrency).toBeGreaterThan(1);
    expect(scenario.parkStrategy).toBe('multi');
  });

  it('warm-sequential is strictly faster per-request than single-cold', () => {
    const cold = WAIT_TIMES_COLD_CONCURRENT_MATRIX.find((s) => s.id === 'single-cold')!;
    const warm = WAIT_TIMES_COLD_CONCURRENT_MATRIX.find((s) => s.id === 'warm-sequential')!;
    expect(warm.perRequestBudgetMs).toBeLessThan(cold.perRequestBudgetMs);
  });
});
