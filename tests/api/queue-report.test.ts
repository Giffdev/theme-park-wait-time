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

vi.mock('@/lib/firebase/admin', () => ({
  adminApp: { name: 'mock-app' },
  adminDb: {},
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
  }),
}));

vi.mock('@/lib/services/crowd-service', () => ({
  submitCrowdReport: (...args: unknown[]) => mockSubmitCrowdReport(...args),
}));

import { POST } from '@/app/api/queue-report/route';

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

describe('POST /api/queue-report', () => {
  const validPayload = {
    parkId: 'magic-kingdom',
    attractionId: 'space-mountain',
    waitTimeMinutes: 35,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-123', email: 'test@example.com' });
    mockSubmitCrowdReport.mockResolvedValue(undefined);
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
        attractionId: 'space-mountain',
        waitTimeMinutes: 35,
      }),
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

  it('does NOT include userId in the written crowd report (privacy)', async () => {
    const request = createRequest(validPayload, {
      Authorization: 'Bearer valid-token',
    });

    await POST(request);

    // Verify submitCrowdReport was called without any user identifier
    const [, reportData] = mockSubmitCrowdReport.mock.calls[0];
    expect(reportData).not.toHaveProperty('userId');
    expect(reportData).not.toHaveProperty('uid');
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

  it('rounds wait time to nearest minute', async () => {
    const request = createRequest(
      { ...validPayload, waitTimeMinutes: 35.7 },
      { Authorization: 'Bearer valid-token' },
    );

    await POST(request);

    const [, reportData] = mockSubmitCrowdReport.mock.calls[0];
    expect(reportData.waitTimeMinutes).toBe(36);
  });
});
