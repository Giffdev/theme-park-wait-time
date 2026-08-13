/**
 * Preview/production cold-concurrent test matrix for /api/wait-times.
 *
 * This module defines the request-shape matrix required by the wait-times
 * 504 architecture review (single cold / warm sequential / 4-way same-park
 * concurrent / no-parkId / 20-request multi-park), each with explicit
 * timing and status thresholds, and a runner that performs real HTTP calls
 * against a target base URL to capture status codes, wall-clock timing, and
 * the `Server-Timing` response header.
 *
 * IMPORTANT — this is a manually/CI-invoked verification tool, not part of
 * the automatic `npm test` run:
 *  - It makes real network requests, so it cannot run inside the mocked
 *    vitest unit suite.
 *  - It must never be pointed at the production URL without the same
 *    explicit human approval the team already requires for any
 *    production-affecting action. Point it at a preview deployment URL by
 *    default.
 *  - Stef (test/review) authors and maintains the matrix definition and
 *    scoring; actually running it against a live preview/production URL is
 *    an execution decision for whoever owns that deployment step.
 *
 * Usage (manual, once a preview URL exists):
 *   npx tsx tests/config/wait-times-cold-concurrent-matrix.ts https://<preview>.vercel.app
 */

export interface MatrixScenario {
  /** Short identifier used in reports. */
  id: string;
  /** Human-readable description of what this scenario exercises. */
  description: string;
  /** How many total requests this scenario issues. */
  requestCount: number;
  /** How many of those requests may be in flight at once (1 = fully sequential). */
  concurrency: number;
  /**
   * Park id strategy: 'same' issues every request for one fixed park (to
   * exercise in-flight/CDN coalescing), 'multi' spreads requests across
   * multiple distinct configured parks, and 'none' omits parkId entirely
   * (the all-configured-parks fan-out path).
   */
  parkStrategy: 'same' | 'multi' | 'none';
  /** Every response must have one of these HTTP statuses. */
  acceptableStatuses: number[];
  /** Wall-clock budget for the whole scenario (all requests combined). */
  totalBudgetMs: number;
  /** Wall-clock budget for any single request within the scenario. */
  perRequestBudgetMs: number;
  /** Whether every response must carry a Server-Timing header. */
  requiresServerTiming: boolean;
}

export const WAIT_TIMES_COLD_CONCURRENT_MATRIX: MatrixScenario[] = [
  {
    id: 'single-cold',
    description:
      'A single request against a cold serverless instance for one park. Establishes the cold-start baseline; the most latency-tolerant scenario because upstream + Firestore write + possible cold-start init all sit on the critical path exactly once.',
    requestCount: 1,
    concurrency: 1,
    parkStrategy: 'same',
    acceptableStatuses: [200],
    totalBudgetMs: 10_000,
    perRequestBudgetMs: 10_000,
    requiresServerTiming: true,
  },
  {
    id: 'warm-sequential',
    description:
      'Five sequential requests for the same park after a warm-up request. Proves a warm instance serving repeat requests for the same park stays fast and does not regress toward the cold-start budget.',
    requestCount: 5,
    concurrency: 1,
    parkStrategy: 'same',
    acceptableStatuses: [200],
    totalBudgetMs: 5_000,
    perRequestBudgetMs: 1_500,
    requiresServerTiming: true,
  },
  {
    id: 'four-way-same-park-concurrent',
    description:
      'Four concurrent requests for the identical park. Exercises same-park in-flight coalescing (single process) and/or CDN-level coalescing (cross-instance) — all four must succeed and complete in roughly one round-trip window, not four independent ones.',
    requestCount: 4,
    concurrency: 4,
    parkStrategy: 'same',
    acceptableStatuses: [200],
    totalBudgetMs: 6_000,
    perRequestBudgetMs: 6_000,
    requiresServerTiming: true,
  },
  {
    id: 'no-parkid',
    description:
      'A single request omitting parkId, fanning out over every configured park. Must remain bounded (concurrent workers, not a sequential per-park loop) and complete well inside the serverless function timeout regardless of how many parks are configured.',
    requestCount: 1,
    concurrency: 1,
    parkStrategy: 'none',
    acceptableStatuses: [200],
    totalBudgetMs: 20_000,
    perRequestBudgetMs: 20_000,
    requiresServerTiming: true,
  },
  {
    id: 'twenty-request-multi-park',
    description:
      'Twenty concurrent requests spread across multiple distinct parks (simulating many simultaneous users at different parks). Every response must succeed and the batch must complete within a bounded window even under real concurrent load.',
    requestCount: 20,
    concurrency: 20,
    parkStrategy: 'multi',
    acceptableStatuses: [200],
    totalBudgetMs: 15_000,
    perRequestBudgetMs: 12_000,
    requiresServerTiming: true,
  },
];

export interface ScenarioResult {
  scenarioId: string;
  passed: boolean;
  totalElapsedMs: number;
  perRequest: Array<{ status: number; elapsedMs: number; serverTiming: string | null }>;
  failures: string[];
}

const MULTI_PARK_IDS = [
  '75ea578a-adc8-4116-a54d-dccb60765ef9', // Magic Kingdom
  '47f90d2c-e191-4239-a466-5892ef59a88b', // EPCOT
  '288747d1-8b4f-4a64-867e-ea7c9b27bad8', // Hollywood Studios
  '1c84a229-8862-4648-9c71-378ddd2c7693', // Animal Kingdom
];
const SAME_PARK_ID = MULTI_PARK_IDS[0];

function buildUrl(baseUrl: string, scenario: MatrixScenario, requestIndex: number): string {
  if (scenario.parkStrategy === 'none') return `${baseUrl}/api/wait-times`;
  if (scenario.parkStrategy === 'same') return `${baseUrl}/api/wait-times?parkId=${SAME_PARK_ID}`;
  const parkId = MULTI_PARK_IDS[requestIndex % MULTI_PARK_IDS.length];
  return `${baseUrl}/api/wait-times?parkId=${parkId}`;
}

export async function runScenario(baseUrl: string, scenario: MatrixScenario): Promise<ScenarioResult> {
  const failures: string[] = [];
  const startedAt = Date.now();

  const requests = Array.from({ length: scenario.requestCount }, (_, index) => index);
  const perRequest: ScenarioResult['perRequest'] = new Array(scenario.requestCount);

  async function runOne(index: number) {
    const requestStartedAt = Date.now();
    const res = await fetch(buildUrl(baseUrl, scenario, index));
    const elapsedMs = Date.now() - requestStartedAt;
    perRequest[index] = {
      status: res.status,
      elapsedMs,
      serverTiming: res.headers.get('server-timing'),
    };

    if (!scenario.acceptableStatuses.includes(res.status)) {
      failures.push(`request ${index}: unexpected status ${res.status}`);
    }
    if (elapsedMs > scenario.perRequestBudgetMs) {
      failures.push(`request ${index}: took ${elapsedMs}ms, budget ${scenario.perRequestBudgetMs}ms`);
    }
    if (scenario.requiresServerTiming && !res.headers.get('server-timing')) {
      failures.push(`request ${index}: missing Server-Timing header`);
    }
  }

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < requests.length) {
      const index = nextIndex++;
      await runOne(index);
    }
  }
  const workerCount = Math.min(Math.max(1, scenario.concurrency), requests.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const totalElapsedMs = Date.now() - startedAt;
  if (totalElapsedMs > scenario.totalBudgetMs) {
    failures.push(`scenario total took ${totalElapsedMs}ms, budget ${scenario.totalBudgetMs}ms`);
  }

  return {
    scenarioId: scenario.id,
    passed: failures.length === 0,
    totalElapsedMs,
    perRequest,
    failures,
  };
}

export async function runColdConcurrentMatrix(baseUrl: string): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const scenario of WAIT_TIMES_COLD_CONCURRENT_MATRIX) {
    results.push(await runScenario(baseUrl, scenario));
  }
  return results;
}

// Manual CLI entry point — never invoked automatically by the test suite.
if (require.main === module) {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error('Usage: npx tsx tests/config/wait-times-cold-concurrent-matrix.ts <baseUrl>');
    process.exit(1);
  }
  if (/vercel\.app$/.test(baseUrl) === false && /localhost/.test(baseUrl) === false) {
    console.warn(`Warning: "${baseUrl}" does not look like a preview/local URL. Do not point this at production without explicit approval.`);
  }
  runColdConcurrentMatrix(baseUrl).then((results) => {
    console.log(JSON.stringify(results, null, 2));
    const failed = results.filter((r) => !r.passed);
    if (failed.length > 0) {
      console.error(`${failed.length}/${results.length} scenarios failed.`);
      process.exit(1);
    }
    console.log(`All ${results.length} scenarios passed.`);
  });
}
