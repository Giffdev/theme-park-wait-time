/**
 * Tests for POST /api/queue-report
 *
 * Integration-style test for the crowd report API route.
 * Validates: auth, input validation, privacy (no userId in written data),
 * and that aggregation is triggered after a valid report.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Firebase Admin
const mockVerifyIdToken = vi.fn();
const mockSubmitCrowdReport = vi.fn();
const mockPublicCreate = vi.fn();
const mockPublicGet = vi.fn();
const mockAttractionGet = vi.fn();
const mockConsumeQueueReportBudget = vi.fn();
const mockPublicQueryGet = vi.fn();
const mockPublicLimit = vi.fn(() => ({ get: mockPublicQueryGet }));
const mockPublicOrderBy = vi.fn(() => ({ limit: mockPublicLimit }));
const mockPublicWhere = vi.fn(() => ({ orderBy: mockPublicOrderBy }));
const mockAdminCollection = vi.fn(() => ({ where: mockPublicWhere }));
const mockAdminDoc = vi.fn((path: string) => {
  if (path.startsWith('attractions/')) return { get: mockAttractionGet };
  return { create: mockPublicCreate, get: mockPublicGet };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminApp: { name: 'mock-app' },
  adminDb: {
    doc: (...args: unknown[]) => mockAdminDoc(...args),
    collection: (...args: unknown[]) => mockAdminCollection(...args),
  },
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
  }),
}));

vi.mock('@/lib/services/crowd-service', () => ({
  submitCrowdReport: (...args: unknown[]) => mockSubmitCrowdReport(...args),
  CrowdReportConflictError: class CrowdReportConflictError extends Error {},
  CrowdReportStaleError: class CrowdReportStaleError extends Error {},
}));

vi.mock('@/lib/services/queue-report-rate-limit', () => ({
  consumeQueueReportBudget: (...args: unknown[]) => mockConsumeQueueReportBudget(...args),
  QueueReportRateLimitError: class QueueReportRateLimitError extends Error {},
}));

import { GET, POST } from '@/app/api/queue-report/route';

// Helper to create NextRequest with body and headers
function createRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/queue-report', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
  return req;
}

const authenticatedHeaders = {
  Authorization: ['Bearer', 'test-token'].join(' '),
};

describe('POST /api/queue-report', () => {
  const validPayload = {
    requestId: 'report-request-1234',
    parkId: 'magic-kingdom',
    attractionId: 'space-mountain',
    attractionName: 'Space Mountain',
    waitTimeMinutes: 35,
    reportedAtMs: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockReset();
    mockSubmitCrowdReport.mockReset();
    mockConsumeQueueReportBudget.mockReset();
    mockPublicCreate.mockReset();
    mockPublicGet.mockReset();
    mockAttractionGet.mockReset();
    mockPublicQueryGet.mockReset();
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-123', email: 'test@example.com' });
    mockSubmitCrowdReport.mockResolvedValue(undefined);
    mockConsumeQueueReportBudget.mockResolvedValue('accepted');
    mockPublicCreate.mockResolvedValue(undefined);
    mockPublicGet.mockResolvedValue({ exists: false, data: () => undefined });
    mockAttractionGet.mockResolvedValue({
      exists: true,
      data: () => ({
        parkId: 'magic-kingdom',
        name: 'Space Mountain',
        entityType: 'ATTRACTION',
      }),
    });
    mockPublicQueryGet.mockResolvedValue({ docs: [] });
  });

  it('returns 200 and writes to Firestore for valid report', async () => {
    const request = createRequest(validPayload, {
      Authorization: 'Bearer valid-token',
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockSubmitCrowdReport).toHaveBeenCalledWith(
      'magic-kingdom',
      expect.objectContaining({
        requestId: 'report-request-1234',
        uid: 'user-123',
        attractionId: 'space-mountain',
        attractionName: 'Space Mountain',
        waitTimeMinutes: 35,
        reportedAt: expect.any(Date),
        allowStaleReplay: false,
      }),
    );
    expect(mockConsumeQueueReportBudget).toHaveBeenCalledWith(
      'user-123',
      'report-request-1234',
    );
  });

  it('returns 400 for missing required fields', async () => {
    const request = createRequest(
      { parkId: 'magic-kingdom' }, // missing attractionId, waitTimeMinutes
      { Authorization: 'Bearer valid-token' },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 when wait time is less than 2 minutes', async () => {
    const request = createRequest(
      { ...validPayload, waitTimeMinutes: 1 },
      { Authorization: 'Bearer valid-token' },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 when wait time exceeds 180 minutes', async () => {
    const request = createRequest(
      { ...validPayload, waitTimeMinutes: 200 },
      { Authorization: 'Bearer valid-token' },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it.each([-1, 0, 2, 180])('accepts the shared wait-time boundary %s', async (waitTimeMinutes) => {
    const response = await POST(createRequest(
      { ...validPayload, requestId: `boundary-${String(waitTimeMinutes).replace('-', 'closed')}-report`, waitTimeMinutes },
      authenticatedHeaders,
    ));
    expect(response.status).toBe(200);
  });

  it.each([1, 181, 12.5])('rejects the shared wait-time boundary %s', async (waitTimeMinutes) => {
    const response = await POST(createRequest(
      { ...validPayload, waitTimeMinutes },
      authenticatedHeaders,
    ));
    expect(response.status).toBe(400);
  });

  it('returns 401 for unauthenticated request (no header)', async () => {
    const request = createRequest(validPayload, {}); // No Authorization header

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('returns 401 for invalid token', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

    const request = createRequest(validPayload, {
      Authorization: 'Bearer invalid-token',
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('passes identity only to the private transactional service', async () => {
    const request = createRequest(validPayload, {
      Authorization: 'Bearer valid-token',
    });

    await POST(request);

    const [, reportData] = mockSubmitCrowdReport.mock.calls[0];
    expect(reportData).not.toHaveProperty('userId');
    expect(reportData).toHaveProperty('uid', 'user-123');
    expect(reportData).not.toHaveProperty('email');
  });

  it('accepts wait time at exactly 2 minutes (minimum valid)', async () => {
    const request = createRequest(
      { ...validPayload, waitTimeMinutes: 2 },
      { Authorization: 'Bearer valid-token' },
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('accepts wait time at exactly 180 minutes (maximum valid)', async () => {
    const request = createRequest(
      { ...validPayload, waitTimeMinutes: 180 },
      { Authorization: 'Bearer valid-token' },
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('rejects fractional wait times rather than changing client intent', async () => {
    const request = createRequest(
      { ...validPayload, waitTimeMinutes: 35.7 },
      { Authorization: 'Bearer valid-token' },
    );

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockSubmitCrowdReport).not.toHaveBeenCalled();
  });

  it('rejects an oversized body before parsing JSON', async () => {
    const request = new NextRequest('http://localhost:3000/api/queue-report', {
      method: 'POST',
      body: JSON.stringify({ ...validPayload, padding: 'x'.repeat(5_000) }),
      headers: {
        ...authenticatedHeaders,
        'Content-Type': 'application/json',
      },
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(mockAttractionGet).not.toHaveBeenCalled();
  });

  it('returns 429 when the verified account budget is exhausted', async () => {
    const { QueueReportRateLimitError } = await import('@/lib/services/queue-report-rate-limit');
    mockConsumeQueueReportBudget.mockRejectedValueOnce(new QueueReportRateLimitError());
    const response = await POST(createRequest(validPayload, authenticatedHeaders));
    expect(response.status).toBe(429);
    expect(mockSubmitCrowdReport).not.toHaveBeenCalled();
  });

  it('fails closed when rate-limit storage is unavailable', async () => {
    mockConsumeQueueReportBudget.mockRejectedValueOnce(new Error('storage unavailable'));
    const response = await POST(createRequest(validPayload, authenticatedHeaders));
    expect(response.status).toBe(503);
    expect(mockSubmitCrowdReport).not.toHaveBeenCalled();
  });

  it.each([
    ['mismatched park', { parkId: 'epcot' }],
    ['spoofed name', { attractionName: 'Fake Mountain' }],
  ])('rejects canonical attraction spoofing: %s', async (_label, changed) => {
    const response = await POST(createRequest(
      { ...validPayload, ...changed },
      { Authorization: 'Bearer test-token' },
    ));
    expect(response.status).toBe(400);
    expect(mockSubmitCrowdReport).not.toHaveBeenCalled();
  });

  it('rejects a missing canonical attraction', async () => {
    mockAttractionGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
    const response = await POST(createRequest(validPayload, { Authorization: 'Bearer test-token' }));
    expect(response.status).toBe(400);
  });

  it('accepts an exact stable-ID replay without duplicating aggregation identity', async () => {
    const response = await POST(createRequest(validPayload, { Authorization: 'Bearer test-token' }));
    expect(response.status).toBe(200);
    expect(mockSubmitCrowdReport).toHaveBeenCalledWith(
      'magic-kingdom',
      expect.objectContaining({ requestId: 'report-request-1234' }),
    );
  });

  it('rejects a stable-ID collision with changed content', async () => {
    const { CrowdReportConflictError } = await import('@/lib/services/crowd-service');
    mockSubmitCrowdReport.mockRejectedValueOnce(new CrowdReportConflictError());
    const response = await POST(createRequest(validPayload, { Authorization: 'Bearer test-token' }));
    expect(response.status).toBe(409);
  });

  it('delegates stale replay reconciliation to the transaction', async () => {
    const stalePayload = {
      ...validPayload,
      reportedAtMs: Date.now() - 10 * 60 * 1000,
    };
    const response = await POST(createRequest(stalePayload, authenticatedHeaders));
    expect(response.status).toBe(200);
    expect(mockSubmitCrowdReport).toHaveBeenCalledWith(
      'magic-kingdom',
      expect.objectContaining({ allowStaleReplay: true }),
    );

    const { CrowdReportStaleError } = await import('@/lib/services/crowd-service');
    mockSubmitCrowdReport.mockRejectedValueOnce(new CrowdReportStaleError());
    const rejected = await POST(createRequest(
      { ...stalePayload, requestId: 'stale-new-report-1234' },
      authenticatedHeaders,
    ));
    expect(rejected.status).toBe(400);
  });

  it('returns only exact anonymous documents from the public read endpoint', async () => {
    const reportedAt = new Date('2026-08-17T18:00:00Z');
    mockPublicQueryGet.mockResolvedValueOnce({
      docs: [
        {
          id: 'safe-report',
          data: () => ({
            schemaVersion: 1,
            attractionId: 'space-mountain',
            attractionName: 'Space Mountain',
            parkId: 'magic-kingdom',
            waitTime: 35,
            reportedAt: { toDate: () => reportedAt },
            status: 'pending',
          }),
        },
        {
          id: 'unsafe-report',
          data: () => ({
            schemaVersion: 1,
            attractionId: 'space-mountain',
            attractionName: 'Space Mountain',
            parkId: 'magic-kingdom',
            waitTime: 40,
            reportedAt: { toDate: () => reportedAt },
            status: 'pending',
            userId: 'stable-user-id',
          }),
        },
      ],
    });

    const response = await GET(new NextRequest(
      'http://localhost:3000/api/queue-report?attractionId=space-mountain&limit=5',
    ));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reports).toEqual([{
      id: 'safe-report',
      schemaVersion: 1,
      attractionId: 'space-mountain',
      attractionName: 'Space Mountain',
      parkId: 'magic-kingdom',
      waitTime: 35,
      reportedAt: reportedAt.toISOString(),
      status: 'pending',
    }]);
  });
});
