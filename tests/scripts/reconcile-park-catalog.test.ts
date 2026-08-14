import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/firebase/admin', () => ({
  adminDb: {},
  adminApp: {},
}));

import {
  AUTHORITATIVE_CATALOG_MODEL,
  ATTRACTION_REFERENCE_SCOPES,
  MAX_ATOMIC_WRITE_ACTIONS,
  MAX_ATTRACTION_REFERENCE_AUDITS,
  PARK_REFERENCE_SCOPES,
  auditAttractionReferences,
  auditRetiredIdentityReferences,
  assertSafeUpsertManifest,
  bindCatalogApprovalDigests,
  buildCatalogManifest,
  computeUpsertPhaseApprovalDigest,
  countEmbeddedValueReferences,
  countDescendantDocuments,
  createFirestoreReferenceProbe,
  evaluateChildCatalogCompleteness,
  hasCompleteRetirementReferenceEvidence,
  mapFirestoreDocument,
  REVIEWED_CHILD_CATALOG_BASELINE,
  type CatalogAttractionDocument,
  type CatalogManifest,
  type CatalogParkDocument,
  type UpstreamAttraction,
  type UpstreamPark,
} from '../../scripts/reconcile-park-catalog';
import { DESTINATION_FAMILIES } from '@/lib/parks/park-registry';

const OCEANS_CURRENT = 'b5a89552-3381-47ad-88cc-ab0087019c8b';
const OCEANS_RETIRED = '951987f7-3387-4221-8368-2859469aebcd';
const OKC_CURRENT = '3964ae15-a1a8-41a1-aea9-23b456e2911f';
const OKC_RETIRED = 'aa8c2744-b792-4802-8a70-8bba51bc73da';
const ARLINGTON_CURRENT = 'a96eb7c6-1fd3-4363-84d9-c84e23f886f1';
const ARLINGTON_ALIAS = '08e5d95c-7c73-4c65-b17a-06fede1801fb';
const UNSUPPORTED_PARK = '00000000-0000-4000-8000-000000000001';
const FIRESTORE_UPDATE_TIME = {
  seconds: 1_755_192_400,
  nanoseconds: 123_456_789,
};
const TEST_CHILD_REVIEW = {
  id: 'fixture-child-catalog',
  reviewedAt: '2026-08-14',
  parkChildIds: {} as Record<string, string[]>,
  growthPolicy: 'allow' as const,
  shrinkPolicy: 'block-until-reviewed' as const,
};

function upstreamParkMetadata(destinationId: string) {
  return {
    entityType: 'PARK' as const,
    parentId: destinationId,
    timezone: 'America/Chicago',
    location: { latitude: 39.1, longitude: -94.5 },
  };
}

function storedParkMetadata(destinationId: string) {
  return {
    entityType: 'PARK' as const,
    parentId: destinationId,
    timezone: 'America/Chicago',
    location: { lat: 39.1, lng: -94.5 },
    firestoreUpdateTime: FIRESTORE_UPDATE_TIME,
  };
}

function completenessFor(
  fixtureParks: UpstreamPark[],
  fixtureAttractions: UpstreamAttraction[]
) {
  const observed = new Map<string, string[]>();
  for (const park of fixtureParks) observed.set(park.id, []);
  for (const attraction of fixtureAttractions) {
    observed.set(attraction.parkId, [
      ...(observed.get(attraction.parkId) ?? []),
      attraction.id,
    ]);
  }
  return evaluateChildCatalogCompleteness(
    {
      ...TEST_CHILD_REVIEW,
      parkChildIds: Object.fromEntries(fixtureParks.map((park) => [park.id, []])),
    },
    fixtureParks.map((park) => park.id),
    observed
  );
}

const parks: CatalogParkDocument[] = [
  {
    docId: OCEANS_CURRENT,
    id: OCEANS_CURRENT,
    name: 'Oceans of Fun',
    slug: 'oceans-of-fun',
    destinationId: 'worlds-destination',
    destinationName: 'Worlds of Fun',
    ...storedParkMetadata('worlds-destination'),
  },
  {
    docId: OCEANS_RETIRED,
    id: OCEANS_RETIRED,
    name: 'Oceans of Fun',
    slug: 'oceans-of-fun',
    destinationId: 'worlds-destination',
    destinationName: 'Worlds of Fun',
    firestoreUpdateTime: FIRESTORE_UPDATE_TIME,
  },
  {
    docId: OKC_CURRENT,
    id: OKC_CURRENT,
    name: 'Hurricane Harbor Oklahoma City',
    slug: 'hurricane-harbor-oklahoma-city',
    destinationId: 'okc-destination',
    destinationName: 'Hurricane Harbor Oklahoma City',
    ...storedParkMetadata('okc-destination'),
  },
  {
    docId: OKC_RETIRED,
    id: OKC_RETIRED,
    name: 'Hurricane Harbor Oklahoma City!',
    slug: 'hurricane-harbor-oklahoma-city',
    destinationId: 'okc-destination',
    destinationName: 'Hurricane Harbor Oklahoma City!',
    firestoreUpdateTime: FIRESTORE_UPDATE_TIME,
  },
];

const upstreamParks: UpstreamPark[] = [
  {
    id: OCEANS_CURRENT,
    name: 'Oceans of Fun',
    slug: 'oceans-of-fun',
    destinationId: 'worlds-destination',
    destinationName: 'Worlds of Fun',
    ...upstreamParkMetadata('worlds-destination'),
  },
  {
    id: OKC_CURRENT,
    name: 'Hurricane Harbor Oklahoma City',
    slug: 'hurricane-harbor-oklahoma-city',
    destinationId: 'okc-destination',
    destinationName: 'Hurricane Harbor Oklahoma City',
    ...upstreamParkMetadata('okc-destination'),
  },
];

const attractions: CatalogAttractionDocument[] = [
  {
    docId: 'moved-attraction',
    id: 'moved-attraction',
    name: 'Moved Ride',
    slug: 'moved-ride',
    parkId: OKC_RETIRED,
    parkName: 'Hurricane Harbor Oklahoma City!',
    entityType: 'ATTRACTION',
    firestoreUpdateTime: FIRESTORE_UPDATE_TIME,
  },
  {
    docId: 'renamed-attraction',
    id: 'renamed-attraction',
    name: 'Old Ride Name',
    slug: 'old-ride-name',
    parkId: OCEANS_CURRENT,
    parkName: 'Oceans of Fun',
    entityType: 'ATTRACTION',
    firestoreUpdateTime: FIRESTORE_UPDATE_TIME,
  },
  {
    docId: 'removed-attraction',
    id: 'removed-attraction',
    name: 'Removed Ride',
    slug: 'removed-ride',
    parkId: OCEANS_CURRENT,
    parkName: 'Oceans of Fun',
    entityType: 'ATTRACTION',
    firestoreUpdateTime: FIRESTORE_UPDATE_TIME,
  },
];

const upstreamAttractions: UpstreamAttraction[] = [
  {
    id: 'moved-attraction',
    name: 'Moved Ride',
    slug: 'moved-ride',
    parkId: OKC_CURRENT,
    parkName: 'Hurricane Harbor Oklahoma City',
    entityType: 'ATTRACTION',
  },
  {
    id: 'renamed-attraction',
    name: 'Current Ride Name',
    slug: 'current-ride-name',
    parkId: OCEANS_CURRENT,
    parkName: 'Oceans of Fun',
    entityType: 'ATTRACTION',
  },
  {
    id: 'new-attraction',
    name: 'New Ride',
    slug: 'new-ride',
    parkId: OCEANS_CURRENT,
    parkName: 'Oceans of Fun',
    entityType: 'ATTRACTION',
  },
];

function manifest(overrides: Partial<Parameters<typeof buildCatalogManifest>[0]> = {}) {
  const input = {
    parks,
    attractions,
    upstreamParks,
    upstreamAttractions,
    generatedAt: '2026-08-14T18:00:00.000Z',
    ...overrides,
  };
  return buildCatalogManifest({
    ...input,
    upstreamCompleteness:
      input.upstreamCompleteness ??
      completenessFor(input.upstreamParks, input.upstreamAttractions),
  });
}

function markUpsertsConverged(result: CatalogManifest): void {
  result.parks.updates = [];
  result.attractions.upsert = [];
  for (const phase of result.migration.upsertPhases) phase.pendingActionCount = 0;
  bindCatalogApprovalDigests(result);
}

function parkAudit(
  parkId: string,
  counts: Partial<Record<(typeof PARK_REFERENCE_SCOPES)[number], number>> = {}
) {
  const checks = PARK_REFERENCE_SCOPES.map((scope) => ({
    scope,
    count: counts[scope] ?? 0,
    complete: true,
  }));
  return {
    parkId,
    checks,
    blockingDocumentCount: checks.reduce((sum, check) => sum + check.count, 0),
    complete: true,
  };
}

function attractionAudit(
  action: CatalogManifest['attractions']['retire'][number],
  counts: Partial<Record<(typeof ATTRACTION_REFERENCE_SCOPES)[number], number>> = {}
) {
  const checks = ATTRACTION_REFERENCE_SCOPES.map((scope) => ({
    scope,
    count: counts[scope] ?? 0,
    complete: true,
  }));
  return {
    attractionId: action.docId,
    parkId: action.parkId,
    checks,
    blockingDocumentCount: checks.reduce((sum, check) => sum + check.count, 0),
    complete: true,
  };
}

function bindCompleteRetirementEvidence(result: CatalogManifest): void {
  result.references = result.parks.retire.map((action) => parkAudit(action.docId));
  result.attractionReferences = result.attractions.retire.map(attractionAudit);
  bindCatalogApprovalDigests(result);
}

describe('full park catalog reconciliation manifest', () => {
  it('pins the approved registry model separately from Firestore inventory counts', () => {
    const result = manifest();

    expect(result.source).toMatchObject({
      registryFamilies: AUTHORITATIVE_CATALOG_MODEL.families,
      registryDestinations: AUTHORITATIVE_CATALOG_MODEL.destinations,
      registryParks: AUTHORITATIVE_CATALOG_MODEL.parks,
      registryMatchesAuthoritativeModel: true,
    });
    expect(AUTHORITATIVE_CATALOG_MODEL.canonicalChildEntities).toBe(6_790);
    expect(result.source.firestoreParkDocuments).toBe(parks.length);
  });

  it('finds both upstream-retired duplicate park documents database-wide', () => {
    const result = manifest();

    expect(result.parks.retire.map((action) => action.docId).sort()).toEqual(
      [OCEANS_RETIRED, OKC_RETIRED].sort()
    );
    expect(result.parks.duplicateSlugs).toHaveLength(2);
    expect(result.parks.retire.find((action) => action.docId === OCEANS_RETIRED)).toMatchObject({
      evidence: {
        rawUpstreamStatus: 'absent',
        declaredLiveFeedAlias: false,
      },
      reason: expect.stringMatching(/absent from the complete raw upstream/i),
    });
  });

  it('truthfully classifies Arlington as a raw-upstream live-feed alias, not absent', () => {
    const upstream: UpstreamPark = {
      id: ARLINGTON_CURRENT,
      name: 'Hurricane Harbor Arlington',
      slug: 'hurricane-harbor-arlington',
      destinationId: '5dd95124-888c-449d-9a65-46d7ecc8878c',
      destinationName: 'Six Flags Over Texas',
      ...upstreamParkMetadata('5dd95124-888c-449d-9a65-46d7ecc8878c'),
    };
    const result = buildCatalogManifest({
      parks: [
        {
          docId: ARLINGTON_CURRENT,
          id: ARLINGTON_CURRENT,
          name: 'Hurricane Harbor Arlington',
          slug: 'hurricane-harbor-arlington',
          destinationId: upstream.destinationId,
          destinationName: upstream.destinationName,
          ...storedParkMetadata(upstream.destinationId),
        },
        {
          docId: ARLINGTON_ALIAS,
          id: ARLINGTON_ALIAS,
          name: 'Hurricane Harbor Arlington',
          slug: 'hurricane-harbor-arlington',
          firestoreUpdateTime: FIRESTORE_UPDATE_TIME,
        },
      ],
      attractions: [],
      upstreamParks: [upstream],
      rawUpstreamParkIds: [ARLINGTON_CURRENT, ARLINGTON_ALIAS],
      rawUpstreamCatalogComplete: true,
      upstreamAttractions: [],
      upstreamCompleteness: completenessFor([upstream], []),
      generatedAt: '2026-08-14T18:00:00.000Z',
    });
    const retirement = result.parks.retire.find(
      (action) => action.docId === ARLINGTON_ALIAS
    );

    expect(retirement).toMatchObject({
      replacementParkId: ARLINGTON_CURRENT,
      evidence: {
        rawUpstreamStatus: 'present',
        declaredLiveFeedAlias: true,
        replacementPresentInCanonicalUpstream: true,
      },
      reason: expect.stringMatching(/remains present in raw upstream.*live-feed alias/i),
    });
    expect(retirement?.reason).not.toMatch(/absent from/i);
  });

  it('creates every missing registry park, then converges idempotently to all 96', () => {
    const canonicalUpstreamParks: UpstreamPark[] = DESTINATION_FAMILIES.flatMap((family) =>
      family.destinations.flatMap((destination) =>
        destination.parks.map((park) => ({
          id: park.id,
          name: park.name,
          slug: park.slug,
          destinationId: destination.id,
          destinationName: destination.name,
          ...upstreamParkMetadata(destination.id),
        }))
      )
    );
    const completeness = completenessFor(canonicalUpstreamParks, []);
    const firstPass = buildCatalogManifest({
      parks: [],
      attractions: [],
      upstreamParks: canonicalUpstreamParks,
      upstreamAttractions: [],
      upstreamCompleteness: completeness,
      generatedAt: '2026-08-14T18:00:00.000Z',
    });

    expect(firstPass.parks.updates).toHaveLength(AUTHORITATIVE_CATALOG_MODEL.parks);
    expect(firstPass.parks.updates.every((action) => action.mode === 'create')).toBe(true);
    expect(firstPass.parks.updates.length).toBeLessThanOrEqual(MAX_ATOMIC_WRITE_ACTIONS);
    expect(firstPass.parks.upstreamParksMissingFromFirestore).toHaveLength(
      AUTHORITATIVE_CATALOG_MODEL.parks
    );
    expect(() => assertSafeUpsertManifest(firstPass)).not.toThrow();

    const reconciledParks: CatalogParkDocument[] = firstPass.parks.updates.map((action) => ({
      docId: action.docId,
      ...(action.data as Omit<CatalogParkDocument, 'docId'>),
    }));
    const secondPass = buildCatalogManifest({
      parks: reconciledParks,
      attractions: [],
      upstreamParks: canonicalUpstreamParks,
      upstreamAttractions: [],
      upstreamCompleteness: completeness,
      generatedAt: '2026-08-14T18:05:00.000Z',
    });

    expect(reconciledParks).toHaveLength(96);
    expect(secondPass.parks.updates).toEqual([]);
    expect(secondPass.parks.upstreamParksMissingFromFirestore).toEqual([]);
  });

  it('carries full upstream park entity metadata on create and repairs metadata drift', () => {
    const authoritative = {
      ...upstreamParks[0],
      entityType: 'PARK' as const,
      parentId: 'worlds-destination',
      timezone: 'America/Chicago',
      location: { latitude: 39.1746, longitude: -94.4886 },
      externalId: 'enchantedparks_park_OOF',
      tags: [{ tag: 'operator', tagName: 'Operator', value: 'Six Flags' }],
    };
    const create = manifest({
      parks: parks.filter((park) => park.docId !== OCEANS_CURRENT),
      upstreamParks: [authoritative, upstreamParks[1]],
    }).parks.updates.find((action) => action.docId === OCEANS_CURRENT)!;

    expect(create).toMatchObject({
      mode: 'create',
      data: {
        entityType: 'PARK',
        parentId: 'worlds-destination',
        timezone: 'America/Chicago',
        location: { lat: 39.1746, lng: -94.4886 },
        externalId: 'enchantedparks_park_OOF',
        tags: [{ tag: 'operator', tagName: 'Operator', value: 'Six Flags' }],
      },
    });

    const repair = manifest({
      parks: parks.map((park) =>
        park.docId === OCEANS_CURRENT
          ? {
              ...park,
              entityType: 'DESTINATION',
              parentId: 'wrong-parent',
              timezone: 'UTC',
              location: {
                lat: 0,
                lng: 0,
                latitude: 0,
                longitude: 0,
              } as unknown as { lat: number; lng: number },
              externalId: 'wrong',
              tags: [],
            }
          : park
      ),
      upstreamParks: [authoritative, upstreamParks[1]],
    }).parks.updates.find((action) => action.docId === OCEANS_CURRENT)!;

    expect(repair.mode).toBe('update');
    expect(repair.changes).toMatchObject({
      entityType: { to: 'PARK' },
      parentId: { to: 'worlds-destination' },
      timezone: { to: 'America/Chicago' },
      location: { to: { lat: 39.1746, lng: -94.4886 } },
      externalId: { to: 'enchantedparks_park_OOF' },
      tags: { to: [{ tag: 'operator', tagName: 'Operator', value: 'Six Flags' }] },
    });
  });

  it('converges a released {lat,lng} location and removes legacy leaves in one pass', () => {
    const authoritative = {
      ...upstreamParks[0],
      location: { latitude: 39.1746, longitude: -94.4886 },
    };
    const existing = parks.map((park) =>
      park.docId === OCEANS_CURRENT
        ? {
            ...park,
            location: {
              lat: 39.1746,
              lng: -94.4886,
              latitude: 39.1746,
              longitude: -94.4886,
            } as unknown as { lat: number; lng: number },
          }
        : park
    );
    const first = manifest({
      parks: existing,
      upstreamParks: [authoritative, upstreamParks[1]],
    });
    const action = first.parks.updates.find((candidate) => candidate.docId === OCEANS_CURRENT)!;

    expect(action.changes.location).toEqual({
      from: {
        lat: 39.1746,
        lng: -94.4886,
        latitude: 39.1746,
        longitude: -94.4886,
      },
      to: { lat: 39.1746, lng: -94.4886 },
    });

    const second = manifest({
      parks: existing.map((park) =>
        park.docId === OCEANS_CURRENT
          ? {
              ...park,
              ...(action.data as Omit<CatalogParkDocument, 'docId'>),
              firestoreUpdateTime: {
                seconds: FIRESTORE_UPDATE_TIME.seconds + 300,
                nanoseconds: FIRESTORE_UPDATE_TIME.nanoseconds,
              },
            }
          : park
      ),
      upstreamParks: [authoritative, upstreamParks[1]],
    });

    expect(second.parks.updates.find((candidate) => candidate.docId === OCEANS_CURRENT)).toBeUndefined();
  });

  it('keeps Firestore path ids authoritative over spoofed stored docId fields', () => {
    expect(
      mapFirestoreDocument({
        id: OCEANS_CURRENT,
        updateTime: FIRESTORE_UPDATE_TIME,
        data: () => ({
          docId: OCEANS_RETIRED,
          firestoreUpdateTime: 'spoofed',
          name: 'Spoofed Park',
        }),
      })
    ).toMatchObject({
      docId: OCEANS_CURRENT,
      firestoreUpdateTime: FIRESTORE_UPDATE_TIME,
      name: 'Spoofed Park',
    });
    expect(
      mapFirestoreDocument({
        id: 'real-attraction-id',
        data: () => ({ docId: 'spoofed-attraction-id', parkId: OCEANS_CURRENT }),
      })
    ).toMatchObject({ docId: 'real-attraction-id', parkId: OCEANS_CURRENT });
  });

  describe('catalog reference audit coverage', () => {
    it('checks user logs, timers, trips/days, crowd reports, and park-keyed stores', async () => {
      const probe = {
        countPark: vi.fn().mockImplementation(async (scope: string) =>
          scope === 'user-ride-logs' || scope === 'trip-days' ? 1 : 0
        ),
        countAttraction: vi.fn().mockResolvedValue(0),
      };

      const [audit] = await auditRetiredIdentityReferences([OKC_RETIRED], probe);

      expect(probe.countPark.mock.calls.map(([scope]) => scope)).toEqual([
        ...PARK_REFERENCE_SCOPES,
      ]);
      expect(audit.blockingDocumentCount).toBe(2);
      expect(audit.complete).toBe(true);
    });

    it('queries users/*/diningLogs/* by parkId and restaurantId child identity', async () => {
      const calls: Array<{
        collectionGroup: string;
        field: string;
        operator: string;
        value: string;
      }> = [];
      const database = {
        collectionGroup: (collectionGroup: string) => ({
          where: (field: string, operator: string, value: string) => {
            calls.push({ collectionGroup, field, operator, value });
            return {
              count: () => ({
                get: async () => ({ data: () => ({ count: 0 }) }),
              }),
            };
          },
        }),
      };
      const probe = createFirestoreReferenceProbe(
        database as unknown as FirebaseFirestore.Firestore
      );

      await expect(
        probe.countPark('user-dining-logs-by-park', OKC_RETIRED)
      ).resolves.toBe(0);
      await expect(
        probe.countAttraction('user-dining-logs-by-child', {
          docId: 'retired-restaurant',
          parkId: OKC_RETIRED,
          reason: 'absent upstream',
          precondition: { exists: true, fields: {} },
        })
      ).resolves.toBe(0);

      expect(calls).toEqual([
        {
          collectionGroup: 'diningLogs',
          field: 'parkId',
          operator: '==',
          value: OKC_RETIRED,
        },
        {
          collectionGroup: 'diningLogs',
          field: 'restaurantId',
          operator: '==',
          value: 'retired-restaurant',
        },
      ]);
    });

    it('blocks a legacy waitTimes/{parkId}/history reference explicitly', async () => {
      const probe = {
        countPark: vi.fn().mockImplementation(async (scope: string) =>
          scope === 'wait-times-history' ? 1 : 0
        ),
        countAttraction: vi.fn().mockResolvedValue(0),
      };

      const [audit] = await auditRetiredIdentityReferences([OKC_RETIRED], probe);

      expect(audit.checks).toContainEqual({
        scope: 'wait-times-history',
        count: 1,
        complete: true,
      });
      expect(audit.blockingDocumentCount).toBe(1);
    });

    it('discovers nested documents even when their parent document is absent', async () => {
      const nestedDocument = {
        get: vi.fn().mockResolvedValue({ exists: true }),
        listCollections: vi.fn().mockResolvedValue([]),
      };
      const absentParent = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        listCollections: vi.fn().mockResolvedValue([
          { listDocuments: vi.fn().mockResolvedValue([nestedDocument]) },
        ]),
      };
      const root = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        listCollections: vi.fn().mockResolvedValue([
          { listDocuments: vi.fn().mockResolvedValue([absentParent]) },
        ]),
      };

      await expect(countDescendantDocuments(root)).resolves.toBe(1);
    });

    it('finds embedded park UUIDs in crowdCalendar/*/monthly/* under a missing parent', async () => {
      const monthlyDocument = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            days: [{ parks: [{ parkId: OKC_RETIRED }, { parkId: OCEANS_CURRENT }] }],
          }),
        }),
        listCollections: vi.fn().mockResolvedValue([]),
      };
      const missingFamilyParent = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        listCollections: vi.fn().mockResolvedValue([
          { listDocuments: vi.fn().mockResolvedValue([monthlyDocument]) },
        ]),
      };
      const crowdCalendar = {
        listDocuments: vi.fn().mockResolvedValue([missingFamilyParent]),
      };

      await expect(
        countEmbeddedValueReferences(crowdCalendar, OKC_RETIRED)
      ).resolves.toBe(1);
      expect(monthlyDocument.get).toHaveBeenCalledTimes(1);
    });

    it('fails closed when nested crowd-calendar enumeration is incomplete', async () => {
      const missingFamilyParent = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        listCollections: vi.fn().mockRejectedValue(new Error('monthly enumeration failed')),
      };
      const crowdCalendar = {
        listDocuments: vi.fn().mockResolvedValue([missingFamilyParent]),
      };

      await expect(
        countEmbeddedValueReferences(crowdCalendar, OKC_RETIRED)
      ).rejects.toThrow(/monthly enumeration failed/i);
    });

    it('fails closed when exhaustive descendant enumeration cannot complete', async () => {
      const probe = {
        countPark: vi.fn().mockImplementation(async (scope: string) => {
          if (scope === 'wait-times-descendants') throw new Error('enumeration unavailable');
          return 0;
        }),
        countAttraction: vi.fn().mockResolvedValue(0),
      };

      const [audit] = await auditRetiredIdentityReferences([OKC_RETIRED], probe);

      expect(audit.complete).toBe(false);
      expect(audit.checks).toContainEqual(
        expect.objectContaining({
          scope: 'wait-times-descendants',
          complete: false,
          error: 'enumeration unavailable',
        })
      );
    });

    it('classifies unqueryable nested attraction references as unresolved and blocking', async () => {
      const probe = {
        countPark: vi.fn().mockResolvedValue(0),
        countAttraction: vi.fn().mockImplementation(async (scope: string) => {
          if (scope === 'nested-history-and-forecast') {
            throw new Error('not queryable');
          }
          return 0;
        }),
      };

      const [audit] = await auditAttractionReferences(
        [
          {
            docId: 'retired-attraction',
            name: 'Retired Ride',
            parkId: OCEANS_CURRENT,
            reason: 'absent upstream',
            precondition: { exists: true, fields: {} },
          },
        ],
        probe
      );

      expect(probe.countAttraction.mock.calls.map(([scope]) => scope)).toEqual([
        ...ATTRACTION_REFERENCE_SCOPES,
      ]);
      expect(audit.complete).toBe(false);
      expect(audit.checks).toContainEqual(
        expect.objectContaining({
          scope: 'nested-history-and-forecast',
          complete: false,
        })
      );
    });

    it('fails closed without issuing unbounded reference queries above the audit quota', async () => {
      const probe = {
        countPark: vi.fn().mockResolvedValue(0),
        countAttraction: vi.fn().mockResolvedValue(0),
      };
      const candidates = Array.from(
        { length: MAX_ATTRACTION_REFERENCE_AUDITS + 1 },
        (_, index) => ({
          docId: `retired-${index}`,
          parkId: OCEANS_CURRENT,
          reason: 'absent upstream',
          precondition: { exists: true, fields: {} },
        })
      );

      const audits = await auditAttractionReferences(candidates, probe);

      expect(probe.countAttraction).not.toHaveBeenCalled();
      expect(audits).toHaveLength(MAX_ATTRACTION_REFERENCE_AUDITS + 1);
      expect(audits.every((audit) => !audit.complete)).toBe(true);
      expect(audits[0].checks[0].scope).toBe('reference-audit-quota');
    });
  });

  it('moves, refreshes, creates, and retires attraction records idempotently', () => {
    const result = manifest();
    const actions = new Map(result.attractions.upsert.map((action) => [action.docId, action]));

    expect(actions.get('moved-attraction')).toMatchObject({
      mode: 'update',
      data: { parkId: OKC_CURRENT, parkName: 'Hurricane Harbor Oklahoma City' },
    });
    expect(actions.get('renamed-attraction')).toMatchObject({
      mode: 'update',
      data: { name: 'Current Ride Name', slug: 'current-ride-name' },
    });
    expect(actions.get('new-attraction')).toMatchObject({ mode: 'create' });
    expect(result.attractions.retire.map((action) => action.docId)).toEqual([
      'removed-attraction',
    ]);

    const reconciledAttractions: CatalogAttractionDocument[] = upstreamAttractions.map(
      (attraction) => ({ docId: attraction.id, ...attraction })
    );
    const secondPass = manifest({ attractions: reconciledAttractions });
    expect(secondPass.attractions.upsert).toEqual([]);
    expect(secondPass.attractions.retire).toEqual([]);
  });

  it('does not upsert attractions for Firestore parks outside the supported registry', () => {
    const result = manifest({
      parks: [
        ...parks,
        {
          docId: UNSUPPORTED_PARK,
          id: UNSUPPORTED_PARK,
          name: 'Unsupported Park',
          slug: 'unsupported-park',
          destinationId: 'unsupported-destination',
          destinationName: 'Unsupported Destination',
          ...upstreamParkMetadata('unsupported-destination'),
        },
      ],
      upstreamParks: [
        ...upstreamParks,
        {
          id: UNSUPPORTED_PARK,
          name: 'Unsupported Park',
          slug: 'unsupported-park',
          destinationId: 'unsupported-destination',
          destinationName: 'Unsupported Destination',
          ...upstreamParkMetadata('unsupported-destination'),
        },
      ],
      upstreamAttractions: [
        ...upstreamAttractions,
        {
          id: 'unsupported-attraction',
          name: 'Unsupported Ride',
          parkId: UNSUPPORTED_PARK,
          parkName: 'Unsupported Park',
          entityType: 'ATTRACTION',
        },
      ],
    });

    expect(result.parks.updates.map((action) => action.docId)).not.toContain(UNSUPPORTED_PARK);
    expect(result.attractions.upsert.map((action) => action.docId)).not.toContain(
      'unsupported-attraction'
    );
  });

  it('keeps unsupported Firestore park attractions review-only instead of deleting them', () => {
    const result = manifest({
      parks: [
        ...parks,
        {
          docId: UNSUPPORTED_PARK,
          id: UNSUPPORTED_PARK,
          name: 'Unsupported Park',
          slug: 'unsupported-park',
        },
      ],
      attractions: [
        ...attractions,
        {
          docId: 'unsupported-local-attraction',
          id: 'unsupported-local-attraction',
          name: 'Unsupported Local Ride',
          parkId: UNSUPPORTED_PARK,
        },
      ],
    });

    expect(result.attractions.retire.map((action) => action.docId)).not.toContain(
      'unsupported-local-attraction'
    );
    expect(result.attractions.review).toContainEqual(
      expect.objectContaining({
        docId: 'unsupported-local-attraction',
        reason: expect.stringMatching(/review-only/i),
      })
    );
  });

  it('keeps child retirement candidates review-only when any upstream feed failed', () => {
    const result = manifest({
      upstreamFetchFailures: [
        {
          stage: 'children',
          parkId: 'failed-park',
          status: 503,
          attempts: 4,
          error: 'HTTP 503',
        },
      ],
    });

    expect(result.attractions.retire).toEqual([]);
    expect(result.attractions.review.map((action) => action.docId)).toContain(
      'removed-attraction'
    );
    expect(() => assertSafeUpsertManifest(result)).toThrow(/incomplete/i);
  });

  it('keeps retirement candidates review-only while deterministic upserts remain', () => {
    const result = manifest();
    bindCompleteRetirementEvidence(result);

    expect(result.migration.retirementReview).toEqual({
      mode: 'review-only',
      automaticDeletionEnabled: false,
      referenceEvidenceComplete: true,
    });
    expect(result.parks.updates.length + result.attractions.upsert.length).toBeGreaterThan(0);
  });

  it('plans an empty-Firestore 96-park/6,790-child migration as resumable bounded phases', () => {
    const canonicalUpstreamParks: UpstreamPark[] = DESTINATION_FAMILIES.flatMap((family) =>
      family.destinations.flatMap((destination) =>
        destination.parks.map((park) => ({
          id: park.id,
          name: park.name,
          slug: park.slug,
          destinationId: destination.id,
          destinationName: destination.name,
          ...upstreamParkMetadata(destination.id),
        }))
      )
    );
    const canonicalAttractions: UpstreamAttraction[] = Object.entries(
      REVIEWED_CHILD_CATALOG_BASELINE.parkChildIds
    ).flatMap(([parkId, childIds]) => {
      const parkName =
        canonicalUpstreamParks.find((park) => park.id === parkId)?.name ?? 'Sanitized Park';
      return childIds.map((id, index) => ({
        id,
        name: `Sanitized child ${index}`,
        entityType: 'ATTRACTION',
        parkId,
        parkName,
      }));
    });
    const observed = new Map(
      Object.entries(REVIEWED_CHILD_CATALOG_BASELINE.parkChildIds).map(
        ([parkId, childIds]) => [parkId, [...childIds]]
      )
    );
    const completeness = evaluateChildCatalogCompleteness(
      REVIEWED_CHILD_CATALOG_BASELINE,
      canonicalUpstreamParks.map((park) => park.id),
      observed
    );
    const first = buildCatalogManifest({
      parks: [],
      attractions: [],
      upstreamParks: canonicalUpstreamParks,
      upstreamAttractions: canonicalAttractions,
      upstreamCompleteness: completeness,
      generatedAt: '2026-08-14T19:00:00.000Z',
    });

    expect(first.parks.updates).toHaveLength(96);
    expect(first.attractions.upsert).toHaveLength(6_790);
    expect(first.parks.updates.length + first.attractions.upsert.length).toBe(6_886);
    expect(first.migration.upsertPhases[0]).toMatchObject({
      id: 'parks',
      targetDocumentCount: 96,
      pendingActionCount: 96,
    });
    expect(first.migration.upsertPhases.every(
      (phase) => phase.pendingActionCount <= MAX_ATOMIC_WRITE_ACTIONS
    )).toBe(true);

    const afterParkPhase = buildCatalogManifest({
      parks: first.parks.updates.map((action) => ({
        ...(action.data as Omit<CatalogParkDocument, 'docId'>),
        docId: action.docId,
      })),
      attractions: [],
      upstreamParks: canonicalUpstreamParks,
      upstreamAttractions: canonicalAttractions,
      upstreamCompleteness: completeness,
      generatedAt: '2026-08-14T20:00:00.000Z',
    });

    expect(afterParkPhase.migration.id).toBe(first.migration.id);
    expect(afterParkPhase.migration.upsertPhases.map((phase) => phase.id)).toEqual(
      first.migration.upsertPhases.map((phase) => phase.id)
    );
    expect(afterParkPhase.parks.updates).toEqual([]);
    expect(afterParkPhase.attractions.upsert).toHaveLength(6_790);
    expect(
      afterParkPhase.attractions.upsert.every(
        (action) => action.writeTimestamp === '2026-08-14T20:00:00.000Z'
      )
    ).toBe(true);
  });

  it('keeps the target catalog id stable while rebinding each phase to pending state', () => {
    const first = manifest();
    const changedState = manifest({
      parks: parks.map((park) =>
        park.docId === OCEANS_CURRENT
          ? {
              ...park,
              name: 'A different stale name',
              firestoreUpdateTime: {
                seconds: FIRESTORE_UPDATE_TIME.seconds + 60,
                nanoseconds: FIRESTORE_UPDATE_TIME.nanoseconds,
              },
            }
          : park
      ),
    });

    expect(changedState.migration.id).toBe(first.migration.id);
    expect(
      changedState.migration.upsertPhases.find((phase) => phase.id === 'parks')
        ?.approvalDigest
    ).not.toBe(
      first.migration.upsertPhases.find((phase) => phase.id === 'parks')?.approvalDigest
    );
  });

  it('invalidates phase approval when a relevant action changes at the same document version', () => {
    const first = manifest();
    const changedAction = manifest({
      parks: parks.map((park) =>
        park.docId === OCEANS_CURRENT ? { ...park, name: 'Another stale value' } : park
      ),
    });

    expect(changedAction.migration.id).toBe(first.migration.id);
    expect(computeUpsertPhaseApprovalDigest(changedAction, 'parks')).not.toBe(
      computeUpsertPhaseApprovalDigest(first, 'parks')
    );
  });

  it('binds phase approval to sub-millisecond Firestore update-time precision', () => {
    const staleParks = parks.map((park) =>
      park.docId === OCEANS_CURRENT ? { ...park, name: 'Stale Oceans name' } : park
    );
    const first = manifest({ parks: staleParks });
    const changedNanoseconds = manifest({
      parks: staleParks.map((park) =>
        park.docId === OCEANS_CURRENT
          ? {
              ...park,
              firestoreUpdateTime: {
                seconds: FIRESTORE_UPDATE_TIME.seconds,
                nanoseconds: FIRESTORE_UPDATE_TIME.nanoseconds + 1,
              },
            }
          : park
      ),
    });

    expect(changedNanoseconds.migration.id).toBe(first.migration.id);
    expect(computeUpsertPhaseApprovalDigest(changedNanoseconds, 'parks')).not.toBe(
      computeUpsertPhaseApprovalDigest(first, 'parks')
    );
  });

  it('binds approval to the exact persisted write timestamp while keeping resume ids stable', () => {
    const staleParks = parks.map((park) =>
      park.docId === OCEANS_CURRENT ? { ...park, name: 'Stale Oceans name' } : park
    );
    const first = manifest({
      parks: staleParks,
      generatedAt: '2026-08-14T18:00:00.000Z',
    });
    const later = manifest({
      parks: staleParks,
      generatedAt: '2026-08-14T18:05:00.000Z',
    });

    expect(later.migration.id).toBe(first.migration.id);
    expect(later.parks.updates[0].writeTimestamp).toBe('2026-08-14T18:05:00.000Z');
    expect(computeUpsertPhaseApprovalDigest(later, 'parks')).not.toBe(
      computeUpsertPhaseApprovalDigest(first, 'parks')
    );
  });

  it('tracks exact retirement reference evidence completeness without authorizing deletes', () => {
    const result = manifest();
    markUpsertsConverged(result);
    bindCompleteRetirementEvidence(result);

    expect(hasCompleteRetirementReferenceEvidence(result)).toBe(true);
    expect(result.migration.retirementReview).toMatchObject({
      mode: 'review-only',
      automaticDeletionEnabled: false,
      referenceEvidenceComplete: true,
    });
    result.references = result.references.map((audit) =>
      audit.parkId === OCEANS_RETIRED
        ? {
            ...parkAudit(audit.parkId),
            checks: parkAudit(audit.parkId).checks.filter(
              (check) => check.scope !== 'user-dining-logs-by-park'
            ),
          }
        : audit
    );
    bindCatalogApprovalDigests(result);
    expect(hasCompleteRetirementReferenceEvidence(result)).toBe(false);
    expect(result.migration.retirementReview.referenceEvidenceComplete).toBe(false);
  });

  it('reports retired park wait or schedule references without enabling deletion', () => {
    const result = manifest();
    markUpsertsConverged(result);
    result.references = result.parks.retire.map((action) =>
      parkAudit(
        action.docId,
        action.docId === OCEANS_RETIRED ? { 'wait-times-current': 1 } : {}
      )
    );
    result.attractionReferences = result.attractions.retire.map(attractionAudit);
    bindCatalogApprovalDigests(result);

    expect(result.references.some((audit) => audit.blockingDocumentCount > 0)).toBe(true);
    expect(result.migration.retirementReview.automaticDeletionEnabled).toBe(false);
  });

  it('reports movable attraction ownership as review evidence only', () => {
    const result = manifest();
    markUpsertsConverged(result);
    result.references = result.parks.retire.map((action) =>
      parkAudit(action.docId, action.docId === OKC_RETIRED ? { attractions: 28 } : {})
    );
    result.attractionReferences = result.attractions.retire.map(attractionAudit);
    bindCatalogApprovalDigests(result);

    expect(
      result.references.find((audit) => audit.parkId === OKC_RETIRED)
        ?.blockingDocumentCount
    ).toBe(28);
    expect(result.migration.retirementReview.automaticDeletionEnabled).toBe(false);
  });

  it('marks complete zero-reference evidence as review-only', () => {
    const result = manifest() as CatalogManifest;
    markUpsertsConverged(result);
    bindCompleteRetirementEvidence(result);

    expect(result.migration.retirementReview).toEqual({
      mode: 'review-only',
      automaticDeletionEnabled: false,
      referenceEvidenceComplete: true,
    });
  });

  it('marks retirement evidence incomplete when a child reference scope is unresolved', () => {
    const result = manifest();
    markUpsertsConverged(result);
    result.references = result.parks.retire.map((action) => parkAudit(action.docId));
    result.attractionReferences = result.attractions.retire.map((action) => ({
      attractionId: action.docId,
      parkId: action.parkId,
      checks: ATTRACTION_REFERENCE_SCOPES.map((scope) =>
        scope === 'nested-history-and-forecast'
          ? { scope, count: 0, complete: false, error: 'not queryable' }
          : { scope, count: 0, complete: true }
      ),
      blockingDocumentCount: 0,
      complete: false,
    }));
    bindCatalogApprovalDigests(result);

    expect(hasCompleteRetirementReferenceEvidence(result)).toBe(false);
    expect(result.migration.retirementReview.referenceEvidenceComplete).toBe(false);
  });

  it('sorts every action list deterministically', () => {
    const result = manifest({
      attractions: [...attractions].reverse(),
      upstreamAttractions: [...upstreamAttractions].reverse(),
    });

    expect(result.attractions.upsert.map((action) => action.docId)).toEqual(
      [...result.attractions.upsert.map((action) => action.docId)].sort()
    );
    expect(result.parks.retire.map((action) => action.docId)).toEqual(
      [...result.parks.retire.map((action) => action.docId)].sort()
    );
  });
});
