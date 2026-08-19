import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const adminMock = vi.hoisted(() => ({
  getAdminServiceAccount: vi.fn(),
  doc: vi.fn((path: string) => ({ path })),
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminProjectId: 'theme-park-wait-times-rest-test',
  adminDb: { doc: adminMock.doc },
  getAdminServiceAccount: adminMock.getAdminServiceAccount,
}));

import {
  batchGetFirestoreDocuments,
  beginFirestoreTransaction,
  commitFirestoreDocuments,
  rollbackFirestoreTransaction,
  runFirestoreEqualityQuery,
} from '@/lib/firebase/firestore-rest-commit';
import { Timestamp } from 'firebase-admin/firestore';
import {
  refreshTripStats,
  saveRideCommand,
  saveTripCommand,
  type SaveCommandDependencies,
} from '@/lib/services/save-command-service';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = 'theme-park-wait-times-rest-test';

function saveDependencies(): SaveCommandDependencies {
  const transport = { projectId, emulatorHost };
  return {
    commitDocuments: (documents, _dependencies, transaction) => (
      commitFirestoreDocuments(documents, transport, transaction)
    ),
    readDocuments: (paths, _dependencies, transaction) => (
      batchGetFirestoreDocuments(paths, transport, transaction)
    ),
    queryDocuments: (query) => runFirestoreEqualityQuery(query, transport),
    beginTransaction: () => beginFirestoreTransaction(transport),
    rollbackTransaction: (transaction) => rollbackFirestoreTransaction(
      transaction,
      transport,
    ),
  };
}

describe.skipIf(!emulatorHost)('Firestore REST commit emulator integration', () => {
  beforeAll(async () => {
    await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
      method: 'DELETE',
    });
  });

  afterAll(async () => {
    await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
      method: 'DELETE',
    });
  });

  it.each([
    ['user name', 'trip name'],
    ['user%2Fid', 'trip%25id'],
    ['使用者', '旅行 🚀'],
  ])('commits and reads literal IDs %s / %s', async (userId, tripId) => {
    const path = `users/${userId}/trips/${tripId}`;
    await commitFirestoreDocuments([{
      path,
      fields: { marker: `${userId}:${tripId}` },
    }], {
      projectId,
      emulatorHost,
    });
    expect(adminMock.getAdminServiceAccount).not.toHaveBeenCalled();

    const read = await batchGetFirestoreDocuments([
      path,
      `users/${userId}/trips/missing-trip`,
    ], {
      projectId,
      emulatorHost,
    });
    expect(read.get(path)?.fields.marker).toBe(`${userId}:${tripId}`);
    expect(read.get(`users/${userId}/trips/missing-trip`)).toBeNull();
    const transaction = await beginFirestoreTransaction({ projectId, emulatorHost });
    const queried = await runFirestoreEqualityQuery({
      collectionPath: `users/${userId}/trips`,
      field: 'marker',
      value: `${userId}:${tripId}`,
      projectionFields: ['marker'],
      pageSize: 1,
      transaction,
    }, { projectId, emulatorHost });
    expect(queried.documents).toEqual([{
      path,
      fields: { marker: `${userId}:${tripId}` },
    }]);
    await rollbackFirestoreTransaction(transaction, { projectId, emulatorHost });
  });

  it('queries only projected matching documents across pages and empty results', async () => {
    const collectionPath = 'users/literal user/rideLogs';
    const hugeNotes = 'n'.repeat(60_000);
    await commitFirestoreDocuments([
      ...Array.from({ length: 5 }, (_, index) => ({
        path: `${collectionPath}/ride ${index}`,
        fields: {
          tripId: 'trip%literal',
          parkId: `park-${index % 2}`,
          parkName: `Park ${index % 2}`,
          attractionId: `attraction-${index}`,
          attractionName: `Attraction ${index}`,
          waitTimeMinutes: index * 10,
          notes: hugeNotes,
        },
      })),
      {
        path: `${collectionPath}/unrelated`,
        fields: {
          tripId: 'other-trip',
          waitTimeMinutes: 999,
          notes: hugeNotes,
        },
      },
    ], { projectId, emulatorHost });

    const transaction = await beginFirestoreTransaction({ projectId, emulatorHost });
    const result = await runFirestoreEqualityQuery({
      collectionPath,
      field: 'tripId',
      value: 'trip%literal',
      projectionFields: [
        'tripId',
        'parkId',
        'parkName',
        'attractionId',
        'attractionName',
        'waitTimeMinutes',
      ],
      pageSize: 2,
      transaction,
    }, { projectId, emulatorHost });

    expect(result.documents).toHaveLength(5);
    expect(result.readTime).toMatch(/^20/);
    expect(result.documents.every(({ fields }) => !('notes' in fields))).toBe(true);
    expect(result.documents.map(({ fields }) => fields.waitTimeMinutes))
      .toEqual([0, 10, 20, 30, 40]);
    await expect(runFirestoreEqualityQuery({
      collectionPath,
      field: 'tripId',
      value: 'missing-trip',
      projectionFields: ['tripId'],
      pageSize: 2,
      transaction,
    }, { projectId, emulatorHost })).resolves.toMatchObject({ documents: [] });
    await rollbackFirestoreTransaction(transaction, { projectId, emulatorHost });
  });

  it('reads projected fields larger than 128 KiB without truncating a page', async () => {
    const collectionPath = 'users/large projection/rideLogs';
    const largeProjection = '界'.repeat(70_000);
    await commitFirestoreDocuments([
      {
        path: `${collectionPath}/first`,
        fields: { tripId: 'large-trip', attractionName: largeProjection },
      },
      {
        path: `${collectionPath}/second`,
        fields: { tripId: 'large-trip', attractionName: 'small' },
      },
      {
        path: `${collectionPath}/third`,
        fields: { tripId: 'large-trip', attractionName: 'last' },
      },
    ], { projectId, emulatorHost });

    const transaction = await beginFirestoreTransaction({ projectId, emulatorHost });
    const result = await runFirestoreEqualityQuery({
      collectionPath,
      field: 'tripId',
      value: 'large-trip',
      projectionFields: ['tripId', 'attractionName'],
      pageSize: 2,
      transaction,
    }, { projectId, emulatorHost });

    expect(result.documents).toHaveLength(3);
    expect(result.documents[0].fields.attractionName).toBe(largeProjection);
    await rollbackFirestoreTransaction(transaction, { projectId, emulatorHost });
  });

  it('returns the exact persisted private and shared stats transform timestamps', async () => {
    const privatePath = 'users/transform-user/trips/transform-trip';
    const sharedPath = 'sharedTrips/transform-share';
    const result = await commitFirestoreDocuments([
      {
        path: privatePath,
        fields: { stats: { totalRides: 1 } },
        serverTimestampFields: ['statsUpdatedAt', 'updatedAt'],
      },
      {
        path: sharedPath,
        fields: { userId: 'transform-user', tripId: 'transform-trip' },
        serverTimestampFields: ['statsUpdatedAt', 'updatedAt'],
      },
    ], { projectId, emulatorHost });
    expect(result).not.toBeNull();

    const persisted = await batchGetFirestoreDocuments(
      [privatePath, sharedPath],
      { projectId, emulatorHost },
    );
    for (const path of [privatePath, sharedPath]) {
      expect(result!.writes.find((write) => write.path === path)
        ?.transformResults.statsUpdatedAt)
        .toBe(persisted.get(path)?.fields.statsUpdatedAt);
    }
  });

  it('persists a trip and its ride visits across fresh reload reads', async () => {
    const uid = 'reload-user';
    const tripId = 'trip-request-reload';
    const dependencies = saveDependencies();
    await expect(saveTripCommand(uid, {
      requestId: tripId,
      name: 'Reload Trip',
      startDate: '2026-08-19',
      endDate: '2026-08-19',
      parkIds: ['magic-kingdom'],
      parkNames: { 'magic-kingdom': 'Magic Kingdom' },
      status: 'active',
      shareId: null,
      notes: '',
    }, dependencies)).resolves.toBe('created');

    for (const [requestId, attractionId, attractionName, waitTimeMinutes] of [
      ['ride-request-reload-1', 'space-mountain', 'Space Mountain', 25],
      ['ride-request-reload-2', 'pirates', 'Pirates of the Caribbean', 10],
    ] as const) {
      await expect(saveRideCommand(uid, {
        requestId,
        parkId: 'magic-kingdom',
        attractionId,
        parkName: 'Magic Kingdom',
        attractionName,
        rodeAt: '2026-08-19T16:00:00.000Z',
        waitTimeMinutes,
        attractionClosed: false,
        source: 'manual',
        rating: null,
        notes: '',
        tripId,
      }, dependencies)).resolves.toMatchObject({
        result: 'created',
        tripId,
        statsUpdated: false,
      });
    }
    await expect(saveRideCommand(uid, {
      requestId: 'ride-request-reload-1',
      parkId: 'magic-kingdom',
      attractionId: 'space-mountain',
      parkName: 'Magic Kingdom',
      attractionName: 'Space Mountain',
      rodeAt: '2026-08-19T16:00:00.000Z',
      waitTimeMinutes: 25,
      attractionClosed: false,
      source: 'manual',
      rating: null,
      notes: '',
      tripId,
    }, dependencies)).resolves.toMatchObject({
      result: 'replayed',
      tripId,
      statsUpdated: false,
    });
    await expect(refreshTripStats(uid, tripId, dependencies)).resolves.toMatchObject({
      stats: { totalRides: 2, totalWaitMinutes: 35 },
    });

    const reloadedTrip = await batchGetFirestoreDocuments(
      [`users/${uid}/trips/${tripId}`],
      { projectId, emulatorHost },
    );
    const reloadedRides = await runFirestoreEqualityQuery({
      collectionPath: `users/${uid}/rideLogs`,
      field: 'tripId',
      value: tripId,
      orderBy: [{ field: '__name__', direction: 'ASCENDING' }],
    }, { projectId, emulatorHost });

    expect(reloadedTrip.get(`users/${uid}/trips/${tripId}`)?.fields).toMatchObject({
      name: 'Reload Trip',
      status: 'active',
      stats: {
        totalRides: 2,
        totalWaitMinutes: 35,
        parksVisited: 1,
        uniqueAttractions: 2,
      },
    });
    expect(reloadedRides.documents.map(({ fields }) => ({
      attractionId: fields.attractionId,
      tripId: fields.tripId,
    }))).toEqual([
      { attractionId: 'space-mountain', tripId },
      { attractionId: 'pirates', tripId },
    ]);
  });

  it('prevents mutations from crossing an aggregate transaction snapshot', async () => {
    const tripPath = 'users/concurrent-user/trips/concurrent-trip';
    const collectionPath = 'users/concurrent-user/rideLogs';
    await commitFirestoreDocuments([
      { path: tripPath, fields: { stats: { totalRides: 0 } } },
      {
        path: `${collectionPath}/ride-old`,
        fields: { tripId: 'concurrent-trip', waitTimeMinutes: 10 },
      },
    ], { projectId, emulatorHost });

    const older = await beginFirestoreTransaction({ projectId, emulatorHost });
    await batchGetFirestoreDocuments([tripPath], { projectId, emulatorHost }, older);
    const olderQuery = await runFirestoreEqualityQuery({
      collectionPath,
      field: 'tripId',
      value: 'concurrent-trip',
      projectionFields: ['tripId', 'waitTimeMinutes'],
      transaction: older,
    }, { projectId, emulatorHost });

    await expect(commitFirestoreDocuments([{
      path: `${collectionPath}/ride-new`,
      fields: { tripId: 'concurrent-trip', waitTimeMinutes: 20 },
    }], { projectId, emulatorHost })).rejects.toMatchObject({ code: 'ABORTED' });
    await rollbackFirestoreTransaction(older, { projectId, emulatorHost });
    await commitFirestoreDocuments([{
      path: `${collectionPath}/ride-new`,
      fields: { tripId: 'concurrent-trip', waitTimeMinutes: 20 },
    }], { projectId, emulatorHost });

    const newer = await beginFirestoreTransaction({ projectId, emulatorHost });
    await batchGetFirestoreDocuments([tripPath], { projectId, emulatorHost }, newer);
    const newerQuery = await runFirestoreEqualityQuery({
      collectionPath,
      field: 'tripId',
      value: 'concurrent-trip',
      projectionFields: ['tripId', 'waitTimeMinutes'],
      transaction: newer,
    }, { projectId, emulatorHost });
    expect(olderQuery.documents).toHaveLength(1);
    expect(newerQuery.documents).toHaveLength(2);

    await commitFirestoreDocuments([{
      path: tripPath,
      fields: {
        stats: { totalRides: 2 },
        statsGeneration: Timestamp.fromDate(new Date(newerQuery.readTime!)),
      },
      operation: 'update',
      updateMaskFields: ['stats', 'statsGeneration'],
    }], { projectId, emulatorHost }, newer);

  });
});
