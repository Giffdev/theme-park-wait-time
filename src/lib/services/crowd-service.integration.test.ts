import { deleteApp, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const emulator = vi.hoisted(() => ({
  appName: 'crowd-service-transaction-integration',
  projectId: 'demo-theme-park-wait-times',
}));

vi.mock('@/lib/firebase/admin', async () => {
  const { getApp, getApps, initializeApp } = await import('firebase-admin/app');
  const { initializeFirestore } = await import('firebase-admin/firestore');
  const app = getApps().some((candidate) => candidate.name === emulator.appName)
    ? getApp(emulator.appName)
    : initializeApp({ projectId: emulator.projectId }, emulator.appName);
  return { adminDb: initializeFirestore(app, { preferRest: true }) };
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

  it('persists a submitted wait time for a subsequent read', async () => {
    const reportedAt = new Date('2026-08-17T18:00:00Z');
    await expect(submitCrowdReport('emulator-park', {
      requestId: 'persisted-report-request',
      uid: 'persisted-report-user',
      attractionId: 'emulator-attraction',
      attractionName: 'Emulator Attraction',
      waitTimeMinutes: 35,
      reportedAt,
      allowStaleReplay: false,
    })).resolves.toBe('accepted');

    const persisted = (
      await adminDb.doc('waitTimeReports/persisted-report-request').get()
    ).data();
    expect(persisted).toEqual(expect.objectContaining({
      schemaVersion: 1,
      attractionId: 'emulator-attraction',
      attractionName: 'Emulator Attraction',
      parkId: 'emulator-park',
      waitTime: 35,
      status: 'pending',
    }));
    expect(persisted?.reportedAt.toDate()).toEqual(reportedAt);
  });

  it('persists a correction when the contributor query reads the caller record again', async () => {
    const firstReportedAt = new Date('2026-08-17T18:00:00Z');
    await submitCrowdReport('emulator-park', {
      requestId: 'original-report-request',
      uid: 'repeat-report-user',
      attractionId: 'emulator-attraction',
      attractionName: 'Emulator Attraction',
      waitTimeMinutes: 20,
      reportedAt: firstReportedAt,
      allowStaleReplay: false,
    });

    await expect(submitCrowdReport('emulator-park', {
      requestId: 'corrected-report-request',
      uid: 'repeat-report-user',
      attractionId: 'emulator-attraction',
      attractionName: 'Emulator Attraction',
      waitTimeMinutes: 35,
      reportedAt: new Date(firstReportedAt.getTime() + 1_000),
      allowStaleReplay: false,
    })).resolves.toBe('accepted');

    const [original, corrected] = await adminDb.getAll(
      adminDb.doc('waitTimeReports/original-report-request'),
      adminDb.doc('waitTimeReports/corrected-report-request'),
    );
    expect(original.exists).toBe(false);
    expect(corrected.data()).toEqual(expect.objectContaining({ waitTime: 35 }));
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
