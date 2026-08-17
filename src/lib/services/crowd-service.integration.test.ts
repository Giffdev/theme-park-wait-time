import { deleteApp, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const emulator = vi.hoisted(() => ({
  appName: 'crowd-service-transaction-integration',
  projectId: 'demo-theme-park-wait-times',
}));

vi.mock('@/lib/firebase/admin', async () => {
  const { getApp, getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps().some((candidate) => candidate.name === emulator.appName)
    ? getApp(emulator.appName)
    : initializeApp({ projectId: emulator.projectId }, emulator.appName);
  return { adminDb: getFirestore(app) };
});

import { submitCrowdReport } from '@/lib/services/crowd-service';

const runWithEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const adminApp = getApps().some((candidate) => candidate.name === emulator.appName)
  ? getApp(emulator.appName)
  : initializeApp({ projectId: emulator.projectId }, emulator.appName);
const adminDb = getFirestore(adminApp);

describe.skipIf(!runWithEmulator)('crowd-service Firestore transactions', () => {
  beforeEach(async () => {
    await Promise.all([
      adminDb.recursiveDelete(adminDb.collection('queueReportRequests')),
      adminDb.recursiveDelete(adminDb.collection('queueReportContributions')),
      adminDb.recursiveDelete(adminDb.collection('waitTimeReports')),
      adminDb.recursiveDelete(adminDb.collection('crowdsourcedWaitTimes')),
    ]);
  });

  afterAll(async () => {
    await deleteApp(adminApp);
  });

  it('commits concurrent contributors against one aggregate with a monotonic timestamp', async () => {
    const baseTime = new Date('2026-08-17T18:00:00Z').getTime();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => submitCrowdReport(
        'emulator-park',
        {
          requestId: `concurrent-request-${index}`,
          uid: `concurrent-user-${index}`,
          attractionId: 'emulator-attraction',
          attractionName: 'Emulator Attraction',
          waitTimeMinutes: (index + 1) * 10,
          reportedAt: new Date(baseTime + index),
          allowStaleReplay: false,
        },
      )),
    );

    expect(results).toEqual(Array(8).fill('accepted'));
    const aggregate = (
      await adminDb.doc(
        'crowdsourcedWaitTimes/emulator-park/aggregates/emulator-attraction',
      ).get()
    ).data();
    expect(aggregate).toEqual(expect.objectContaining({
      currentEstimateMinutes: 45,
      reportCount: 8,
      lastReportedAtMs: baseTime + 7,
    }));
  });
});
