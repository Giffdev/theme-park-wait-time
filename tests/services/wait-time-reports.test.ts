import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
const mockGetIdToken = vi.fn();
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: {
    currentUser: {
      uid: 'user-123',
      getIdToken: vi.fn(),
    } as { uid: string; getIdToken: ReturnType<typeof vi.fn> } | null,
  },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  Timestamp: { fromDate: vi.fn() },
}));

vi.mock('@/lib/firebase/config', () => ({
  auth: mockAuth,
  db: {},
}));

import {
  getConsensusWaitTime,
  getRecentReports,
  getOrCreateWaitTimeReportCommand,
  submitWaitTimeReport,
  WaitTimeReportError,
} from '@/lib/firebase/waitTimeReports';

const validReport = {
  requestId: 'report-request-1234',
  attractionId: 'space-mountain',
  attractionName: 'Space Mountain',
  parkId: 'magic-kingdom',
  waitTime: 35,
};

function response(status = 200, error?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(error ? { error } : {}),
  };
}

describe('waitTimeReports service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = { uid: 'user-123', getIdToken: mockGetIdToken };
    mockGetIdToken.mockResolvedValue('test-token');
    mockFetch.mockResolvedValue(response());
    vi.stubGlobal('fetch', mockFetch);
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends an exact anonymous shape through the trusted server path', async () => {
    await expect(submitWaitTimeReport(validReport)).resolves.toBe(validReport.requestId);

    expect(mockFetch).toHaveBeenCalledWith('/api/queue-report', expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
    }));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({
      requestId: validReport.requestId,
      attractionId: 'space-mountain',
      attractionName: 'Space Mountain',
      parkId: 'magic-kingdom',
      waitTimeMinutes: 35,
      reportedAtMs: expect.any(Number),
    });
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('username');
  });

  it('replays the same request ID, payload, and timestamp on retry', async () => {
    const report = { ...validReport, requestId: 'retry-report-1234' };
    mockFetch.mockResolvedValueOnce(response(500, 'temporary failure'));
    await expect(submitWaitTimeReport(report)).rejects.toMatchObject({ code: 'write-failed' });
    await submitWaitTimeReport({ ...report, waitTime: 99 });

    const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondBody).toEqual(firstBody);
  });

  it('requires authentication and validates the report contract', async () => {
    mockAuth.currentUser = null;
    await expect(submitWaitTimeReport({ ...validReport, requestId: 'auth-report-1234' }))
      .rejects.toMatchObject({ code: 'auth-required' });

    mockAuth.currentUser = { uid: 'user-123', getIdToken: mockGetIdToken };
    await expect(submitWaitTimeReport({
      ...validReport,
      requestId: 'invalid-report-1234',
      waitTime: 181,
    })).rejects.toMatchObject({ code: 'invalid-data' });
  });

  it.each([-1, 0, 2, 180])('accepts shared wait-time boundary %s', async (waitTime) => {
    await expect(submitWaitTimeReport({
      ...validReport,
      requestId: `boundary-${String(waitTime).replace('-', 'closed')}-report`,
      waitTime,
    })).resolves.toBeTruthy();
  });

  it.each([1, 181, 12.5])('rejects shared wait-time boundary %s', async (waitTime) => {
    await expect(submitWaitTimeReport({
      ...validReport,
      requestId: `invalid-${String(waitTime).replace('.', '-')}-report`,
      waitTime,
    })).rejects.toMatchObject({ code: 'invalid-data' });
  });

  it.each([
    [401, 'auth-required'],
    [400, 'invalid-data'],
    [403, 'permission-denied'],
    [429, 'rate-limited'],
    [500, 'write-failed'],
  ])('maps server status %s', async (status, expectedCode) => {
    mockFetch.mockResolvedValueOnce(response(status, 'server rejected report'));
    await expect(submitWaitTimeReport({
      ...validReport,
      requestId: `status-${status}-report`,
    })).rejects.toMatchObject({ code: expectedCode });
  });

  it('maps browser offline failures', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    mockFetch.mockRejectedValueOnce(new Error('network failed'));
    await expect(submitWaitTimeReport({
      ...validReport,
      requestId: 'offline-report-1234',
    })).rejects.toMatchObject({ code: 'offline' });
  });

  it('times out and retries with the identical request body', async () => {
    vi.useFakeTimers();
    mockFetch.mockReturnValueOnce(new Promise(() => {}));
    const result = submitWaitTimeReport({
      ...validReport,
      requestId: 'timeout-report-1234',
    });
    const assertion = expect(result).rejects.toBeInstanceOf(WaitTimeReportError);

    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;

    mockFetch.mockResolvedValueOnce(response());
    await expect(submitWaitTimeReport({
      ...validReport,
      requestId: 'timeout-report-1234',
    })).resolves.toBe('timeout-report-1234');
    expect(mockFetch.mock.calls[1][1].body).toBe(mockFetch.mock.calls[0][1].body);
  });

  it('persists a frozen command across unmount-style recreation until completion', async () => {
    const first = getOrCreateWaitTimeReportCommand({
      accountId: 'user-123',
      attractionId: 'space-mountain',
      attractionName: 'Space Mountain',
      parkId: 'magic-kingdom',
      waitTime: 35,
    });
    const reopened = getOrCreateWaitTimeReportCommand({
      accountId: 'user-123',
      attractionId: 'space-mountain',
      attractionName: 'Space Mountain',
      parkId: 'magic-kingdom',
      waitTime: 99,
    });
    expect(reopened).toEqual(first);

    await submitWaitTimeReport(reopened);
    const next = getOrCreateWaitTimeReportCommand({
      accountId: 'user-123',
      attractionId: 'space-mountain',
      attractionName: 'Space Mountain',
      parkId: 'magic-kingdom',
      waitTime: 99,
    });
    expect(next.requestId).not.toBe(first.requestId);
    expect(next.waitTime).toBe(99);
  });

  it('reads only server-sanitized public reports and computes consensus', async () => {
    const now = new Date().toISOString();
    const reports = [
      {
        id: 'one',
        schemaVersion: 1,
        attractionId: 'space-mountain',
        attractionName: 'Space Mountain',
        parkId: 'magic-kingdom',
        status: 'pending',
        reportedAt: now,
        waitTime: 20,
      },
      {
        id: 'two',
        schemaVersion: 1,
        attractionId: 'space-mountain',
        attractionName: 'Space Mountain',
        parkId: 'magic-kingdom',
        status: 'pending',
        reportedAt: now,
        waitTime: 40,
      },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        reports,
      }),
    });
    await expect(getRecentReports('space-mountain', 5)).resolves.toHaveLength(2);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        reports,
      }),
    });
    await expect(getConsensusWaitTime('space-mountain')).resolves.toBe(30);
  });
});
