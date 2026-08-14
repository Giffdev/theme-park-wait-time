import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const batch = {
    create: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(),
  };
  return {
    batch,
    createBatch: vi.fn(() => batch),
    timestamp: { fixed: '2026-08-14T19:00:00.000Z' },
    fromDate: vi.fn(() => ({ fixed: '2026-08-14T19:00:00.000Z' })),
    timestampConstructor: vi.fn(),
  };
});

vi.mock('../../src/lib/firebase/admin', () => ({
  adminDb: {
    batch: mocks.createBatch,
    collection: (collectionName: string) => ({
      doc: (docId: string) => ({ collectionName, docId }),
    }),
  },
  adminApp: {},
}));

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: class {
    static fromDate = mocks.fromDate;
    seconds: number;
    nanoseconds: number;

    constructor(seconds: number, nanoseconds: number) {
      mocks.timestampConstructor(seconds, nanoseconds);
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
  },
}));

import {
  MAX_ATOMIC_WRITE_ACTIONS,
  applyUpserts,
  bindCatalogApprovalDigests,
  buildCatalogManifest,
  evaluateChildCatalogCompleteness,
} from '../../scripts/reconcile-park-catalog';

const PARK_ID = 'b5a89552-3381-47ad-88cc-ab0087019c8b';
const DESTINATION_ID = 'c4231018-dc6f-4d8d-bfc2-7a21a6c9e9fa';
const FIRESTORE_UPDATE_TIME = {
  seconds: 1_755_198_900,
  nanoseconds: 123_456_789,
};
const TEST_CHILD_REVIEW = {
  id: 'fixture-child-catalog',
  reviewedAt: '2026-08-14',
  parkChildIds: { [PARK_ID]: [] } as Record<string, string[]>,
  growthPolicy: 'allow' as const,
  shrinkPolicy: 'block-until-reviewed' as const,
};

function manifestWithAttractions(count: number) {
  return buildCatalogManifest({
    parks: [
      {
        docId: PARK_ID,
        id: PARK_ID,
        name: 'Drifted Name',
        slug: 'oceans-of-fun',
        destinationId: DESTINATION_ID,
        destinationName: 'Worlds of Fun',
        entityType: 'PARK',
        parentId: DESTINATION_ID,
        timezone: 'America/Chicago',
        location: { lat: 39.1, lng: -94.5 },
        firestoreUpdateTime: FIRESTORE_UPDATE_TIME,
      },
    ],
    attractions: [],
    upstreamParks: [
      {
        id: PARK_ID,
        name: 'Oceans of Fun',
        slug: 'oceans-of-fun',
        destinationId: DESTINATION_ID,
        destinationName: 'Worlds of Fun',
        entityType: 'PARK',
        parentId: DESTINATION_ID,
        timezone: 'America/Chicago',
        location: { latitude: 39.1, longitude: -94.5 },
      },
    ],
    upstreamAttractions: Array.from({ length: count }, (_, index) => ({
      id: `ride-${String(index).padStart(3, '0')}`,
      name: `Ride ${index}`,
      parkId: PARK_ID,
      parkName: 'Oceans of Fun',
      entityType: 'ATTRACTION',
    })),
    upstreamCompleteness: evaluateChildCatalogCompleteness(
      TEST_CHILD_REVIEW,
      [PARK_ID],
      new Map([
        [
          PARK_ID,
          Array.from({ length: count }, (_, index) =>
            `ride-${String(index).padStart(3, '0')}`
          ),
        ],
      ])
    ),
    generatedAt: '2026-08-14T19:00:00.000Z',
  });
}

describe('atomic catalog upsert store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.batch.commit.mockResolvedValue(undefined);
  });

  it('uses one atomic batch and one stable updatedAt value for every action', async () => {
    const manifest = manifestWithAttractions(100);
    manifest.parks.updates = [];
    manifest.migration.upsertPhases.find((phase) => phase.id === 'parks')!.pendingActionCount = 0;
    bindCatalogApprovalDigests(manifest);
    const phase = manifest.migration.upsertPhases
      .filter((candidate) => candidate.kind === 'attractions')
      .sort((left, right) => right.pendingActionCount - left.pendingActionCount)[0];

    await applyUpserts(manifest, phase.id);

    expect(mocks.createBatch).toHaveBeenCalledTimes(1);
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
    expect(mocks.batch.create).toHaveBeenCalledTimes(phase.pendingActionCount);
    expect(phase.pendingActionCount).toBeGreaterThan(1);
    for (const [, data] of mocks.batch.create.mock.calls) {
      expect(data.updatedAt).toEqual(mocks.timestamp);
    }
    expect(mocks.fromDate).toHaveBeenCalledTimes(phase.pendingActionCount);
    expect(
      mocks.fromDate.mock.calls.every(
        ([date]) => date.toISOString() === '2026-08-14T19:00:00.000Z'
      )
    ).toBe(true);
  });

  it('includes a missing canonical park create in the same atomic batch', async () => {
    const manifest = manifestWithAttractions(0);
    manifest.source.firestoreParkDocuments = 0;
    manifest.parks.updates[0].mode = 'create';
    manifest.parks.updates[0].precondition = { exists: false, fields: {} };
    bindCatalogApprovalDigests(manifest);

    await applyUpserts(manifest, 'parks');

    expect(mocks.createBatch).toHaveBeenCalledTimes(1);
    expect(mocks.batch.create).toHaveBeenCalledWith(
      { collectionName: 'parks', docId: PARK_ID },
      expect.objectContaining({ id: PARK_ID, updatedAt: mocks.timestamp })
    );
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('replaces the top-level location map under an update-time precondition', async () => {
    const manifest = manifestWithAttractions(0);

    await applyUpserts(manifest, 'parks');

    expect(mocks.batch.update).toHaveBeenCalledWith(
      { collectionName: 'parks', docId: PARK_ID },
      expect.objectContaining({
        location: { lat: 39.1, lng: -94.5 },
        updatedAt: mocks.timestamp,
      }),
      { lastUpdateTime: expect.objectContaining(FIRESTORE_UPDATE_TIME) }
    );
    expect(mocks.batch.create).not.toHaveBeenCalled();
  });

  it('reconstructs an exact non-millisecond Firestore update precondition', async () => {
    const manifest = manifestWithAttractions(0);

    await applyUpserts(manifest, 'parks');

    expect(mocks.timestampConstructor).toHaveBeenCalledWith(
      FIRESTORE_UPDATE_TIME.seconds,
      FIRESTORE_UPDATE_TIME.nanoseconds
    );
    expect(mocks.batch.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      {
        lastUpdateTime: expect.objectContaining(FIRESTORE_UPDATE_TIME),
      }
    );
  });

  it('writes only one bounded deterministic attraction phase', async () => {
    const manifest = manifestWithAttractions(MAX_ATOMIC_WRITE_ACTIONS + 50);
    manifest.parks.updates = [];
    manifest.migration.upsertPhases.find((phase) => phase.id === 'parks')!.pendingActionCount = 0;
    bindCatalogApprovalDigests(manifest);
    const phase = manifest.migration.upsertPhases.find(
      (candidate) => candidate.kind === 'attractions' && candidate.pendingActionCount > 0
    )!;

    await applyUpserts(manifest, phase.id);

    expect(mocks.batch.create).toHaveBeenCalledTimes(phase.pendingActionCount);
    expect(phase.pendingActionCount).toBeLessThanOrEqual(MAX_ATOMIC_WRITE_ACTIONS);
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('does not write when an action timestamp no longer matches its reviewed digest', async () => {
    const manifest = manifestWithAttractions(0);
    manifest.parks.updates[0].writeTimestamp = '2026-08-14T19:05:00.000Z';

    await expect(applyUpserts(manifest, 'parks')).rejects.toThrow(/write timestamp|digest/i);
    expect(mocks.createBatch).not.toHaveBeenCalled();
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });
});
