import { deleteApp, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const emulator = vi.hoisted(() => ({
  appName: 'queue-report-route-integration',
  projectId: 'demo-theme-park-wait-times',
}));

const verifyIdToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/admin', async () => {
  const { getApp, getApps, initializeApp } = await import('firebase-admin/app');
  const { initializeFirestore } = await import('firebase-admin/firestore');
  const app = getApps().some((candidate) => candidate.name === emulator.appName)
    ? getApp(emulator.appName)
    : initializeApp({ projectId: emulator.projectId }, emulator.appName);
  return {
    adminApp: app,
    adminDb: initializeFirestore(app, { preferRest: true }),
  };
});

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken }),
}));

import { POST } from '@/app/api/queue-report/route';

const runWithEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const adminApp = getApps().some((candidate) => candidate.name === emulator.appName)
  ? getApp(emulator.appName)
  : initializeApp({ projectId: emulator.projectId }, emulator.appName);
const adminDb = getFirestore(adminApp);

function request(overrides: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/queue-report', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer emulator-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestId: 'route-report-request',
      parkId: 'emulator-park',
      attractionId: 'emulator-attraction',
      attractionName: 'Emulator Attraction',
      waitTimeMinutes: 35,
      reportedAtMs: Date.now(),
      ...overrides,
    }),
  });
}

describe.skipIf(!runWithEmulator)('queue-report route Firestore persistence', () => {
  beforeEach(async () => {
    verifyIdToken.mockReset();
    verifyIdToken.mockResolvedValue({ uid: 'route-user' });
    await Promise.all([
      adminDb.recursiveDelete(adminDb.collection('attractions')),
      adminDb.recursiveDelete(adminDb.collection('queueReportRateLimits')),
      adminDb.recursiveDelete(adminDb.collection('queueReportRequests')),
      adminDb.recursiveDelete(adminDb.collection('queueReportContributions')),
      adminDb.recursiveDelete(adminDb.collection('waitTimeReports')),
      adminDb.recursiveDelete(adminDb.collection('crowdsourcedWaitTimes')),
      adminDb.recursiveDelete(adminDb.collection('users')),
    ]);
    await adminDb.doc('attractions/emulator-attraction').set({
      parkId: 'emulator-park',
      name: 'Emulator Attraction',
      entityType: 'ATTRACTION',
    });
  });

  afterAll(async () => {
    await deleteApp(adminApp);
  });

  it('authenticates, commits all report state atomically, and confirms a stable replay', async () => {
    const reportedAtMs = Date.now();
    const first = await POST(request({ reportedAtMs }));
    const replay = await POST(request({ reportedAtMs }));

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      success: true,
      requestId: 'route-report-request',
      outcome: 'accepted',
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({
      success: true,
      requestId: 'route-report-request',
      outcome: 'replay',
    });

    const [report, requestRecord, contributions, budgets] = await Promise.all([
      adminDb.doc('waitTimeReports/route-report-request').get(),
      adminDb.doc('queueReportRequests/route-report-request').get(),
      adminDb.collection('queueReportContributions').get(),
      adminDb.collection('queueReportRateLimits').get(),
    ]);
    expect(report.data()).toEqual(expect.objectContaining({
      attractionName: 'Emulator Attraction',
      waitTime: 35,
    }));
    expect(requestRecord.data()).toEqual(expect.objectContaining({
      attractionName: 'Emulator Attraction',
      outcome: 'accepted',
    }));
    expect(contributions.size).toBe(1);
    expect(budgets.size).toBe(1);
    expect(budgets.docs[0].data().recentRequests).toHaveLength(1);
  });

  it('does not consume rate budget or create partial report state when validation fails', async () => {
    const response = await POST(request({ parkId: 'wrong-park' }));
    expect(response.status).toBe(400);

    const [reports, requests, contributions, budgets] = await Promise.all([
      adminDb.collection('waitTimeReports').get(),
      adminDb.collection('queueReportRequests').get(),
      adminDb.collection('queueReportContributions').get(),
      adminDb.collection('queueReportRateLimits').get(),
    ]);
    expect(reports.empty).toBe(true);
    expect(requests.empty).toBe(true);
    expect(contributions.empty).toBe(true);
    expect(budgets.empty).toBe(true);
  });

  it('accepts a first delivery older than five minutes only when the durable ride matches', async () => {
    const reportedAtMs = Date.now() - 10 * 60 * 1000;
    await adminDb.doc('users/route-user/rideLogs/route-report-request').set({
      clientRequestId: 'route-report-request',
      parkId: 'emulator-park',
      attractionId: 'emulator-attraction',
      waitTimeMinutes: 35,
      rodeAt: Timestamp.fromMillis(reportedAtMs),
      source: 'timer',
    });

    const accepted = await POST(request({ reportedAtMs }));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({
      success: true,
      requestId: 'route-report-request',
      outcome: 'accepted',
    });

    const rejected = await POST(request({
      requestId: 'different-delayed-request',
      reportedAtMs,
    }));
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: 'Report timestamp is stale' });
  });
});
