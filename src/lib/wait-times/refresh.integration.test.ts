import { generateKeyPairSync } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

const runWithEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PARK_ID = 'quota-gate-integration-park';
const START_MS = Date.parse('2026-08-22T05:00:00.000Z');
const originalServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

let adminDb: Firestore;
let claimHistoryArchiveWindow: typeof import('@/lib/wait-times/refresh')['claimHistoryArchiveWindow'];
let writeCurrentWaitTimes: typeof import('@/lib/wait-times/refresh')['writeCurrentWaitTimes'];

function emulatorServiceAccount(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return JSON.stringify({
    project_id: 'demo-theme-park-wait-times',
    client_email: 'quota-gate@demo-theme-park-wait-times.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    token_uri: 'https://oauth2.googleapis.com/token',
  });
}

describe.skipIf(!runWithEmulator)('wait-time history archive Firestore gate', () => {
  beforeAll(async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = emulatorServiceAccount();
    ({ adminDb } = await import('@/lib/firebase/admin'));
    ({ claimHistoryArchiveWindow, writeCurrentWaitTimes } = await import('@/lib/wait-times/refresh'));
  });

  afterAll(() => {
    if (originalServiceAccount === undefined) {
      delete process.env.FIREBASE_SERVICE_ACCOUNT;
    } else {
      process.env.FIREBASE_SERVICE_ACCOUNT = originalServiceAccount;
    }
  });

  afterEach(async () => {
    await adminDb.recursiveDelete(adminDb.collection('waitTimes').doc(PARK_ID));
  });

  it('serializes contenders and reopens after five minutes', async () => {
    const contenders = await Promise.all(
      Array.from({ length: 10 }, () => claimHistoryArchiveWindow(PARK_ID, START_MS)),
    );

    expect(contenders.filter(Boolean)).toHaveLength(1);
    await expect(
      claimHistoryArchiveWindow(PARK_ID, START_MS + 4 * 60 * 1000),
    ).resolves.toBe(false);
    await expect(
      claimHistoryArchiveWindow(PARK_ID, START_MS + 5 * 60 * 1000),
    ).resolves.toBe(true);
  });

  it('rejects an older contender that attempts to commit after a newer snapshot', async () => {
    const at = (iso: string, attractionId: string, waitMinutes: number) => ({
      attractionId,
      attractionName: attractionId,
      status: 'OPERATING',
      waitMinutes,
      lastUpdated: iso,
      fetchedAt: iso,
    });
    const initialAt = '2026-08-22T05:00:00.000Z';
    const olderAt = '2026-08-22T05:01:00.000Z';
    const newerAt = '2026-08-22T05:01:01.000Z';

    await writeCurrentWaitTimes(PARK_ID, [
      at(initialAt, 'attraction-a', 10),
      at(initialAt, 'attraction-b', 10),
    ], initialAt);

    const originalRunTransaction = adminDb.runTransaction.bind(adminDb);
    let releaseOlderTransaction!: () => void;
    const olderTransactionBlocked = new Promise<void>((resolve) => {
      releaseOlderTransaction = resolve;
    });
    let markOlderTransactionReady!: () => void;
    const olderTransactionReady = new Promise<void>((resolve) => {
      markOlderTransactionReady = resolve;
    });
    let transactionCount = 0;
    const transactionSpy = vi.spyOn(adminDb, 'runTransaction').mockImplementation(
      async (updateFunction, options) => {
        const transactionNumber = transactionCount++;
        if (transactionNumber === 0) {
          markOlderTransactionReady();
          await olderTransactionBlocked;
        }
        return originalRunTransaction(updateFunction, options);
      }
    );

    let olderStatus;
    let newerStatus;
    try {
      const olderPublication = writeCurrentWaitTimes(PARK_ID, [
        at(olderAt, 'attraction-a', 20),
        at(olderAt, 'attraction-b', 10),
      ], olderAt);
      await olderTransactionReady;

      newerStatus = await writeCurrentWaitTimes(PARK_ID, [
        at(newerAt, 'attraction-a', 10),
        at(newerAt, 'attraction-b', 30),
      ], newerAt);
      releaseOlderTransaction();
      olderStatus = await olderPublication;
    } finally {
      releaseOlderTransaction();
      transactionSpy.mockRestore();
    }

    expect(transactionCount).toBe(2);
    expect(newerStatus).toBe('published');
    expect(olderStatus).toBe('rejected-stale');
    const parent = (await adminDb.collection('waitTimes').doc(PARK_ID).get()).data()!;
    const currentSnapshot = await adminDb
      .collection('waitTimes')
      .doc(PARK_ID)
      .collection('current')
      .get();
    const parentEntries = (parent.entries as Array<Record<string, unknown>>)
      .sort((left, right) => String(left.attractionId).localeCompare(String(right.attractionId)));
    const currentEntries = currentSnapshot.docs
      .map((doc) => doc.data())
      .sort((left, right) => String(left.attractionId).localeCompare(String(right.attractionId)));

    expect(currentEntries).toEqual(parentEntries);
    expect(parent.fetchedAt).toBe(newerAt);
    expect(parentEntries.map((entry) => entry.waitMinutes)).toEqual([10, 30]);
  });
});
