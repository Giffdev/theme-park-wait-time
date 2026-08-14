import { describe, expect, it } from 'vitest';
import {
  buildParkCatalogAudit,
  runCatalogAuditCli,
  type ApiChild,
  type ApiDestination,
  type ApiEntity,
  type FetchResult,
} from '../../scripts/audit-park-catalog';
import type { DestinationFamily } from '@/lib/parks/park-registry';

const DESTINATION_ID = '11111111-1111-4111-8111-111111111111';
const PARK_ID = '22222222-2222-4222-8222-222222222222';
const ALIAS_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_PARK_ID = '44444444-4444-4444-8444-444444444444';
const RIDE_ID = '55555555-5555-4555-8555-555555555555';

const registry: DestinationFamily[] = [
  {
    familyId: 'test-family',
    familyName: 'Test Family',
    destinations: [
      {
        id: DESTINATION_ID,
        name: 'Test Destination',
        slug: 'test-destination',
        parks: [
          {
            id: PARK_ID,
            name: 'Test Park',
            slug: 'test-park',
            liveDataIds: [PARK_ID, ALIAS_ID],
          },
          {
            id: OTHER_PARK_ID,
            name: 'Other Park',
            slug: 'other-park',
          },
        ],
      },
    ],
  },
];

function ok<T>(data: T): FetchResult<T> {
  return { status: 200, data };
}

function entity(id: string, name: string): ApiEntity {
  return {
    id,
    name,
    entityType: 'PARK',
    parentId: DESTINATION_ID,
    destinationId: DESTINATION_ID,
    timezone: 'America/Chicago',
  };
}

function buildInput(overrides: {
  destinations?: ApiDestination[];
  entities?: Map<string, FetchResult<ApiEntity>>;
  children?: Map<string, FetchResult<ApiChild[]>>;
  live?: Map<string, FetchResult<ApiChild[]>>;
} = {}) {
  return {
    registry,
    destinations: overrides.destinations ?? [
      {
        id: DESTINATION_ID,
        name: 'Test Destination',
        parks: [
          { id: PARK_ID, name: 'Test Park' },
          { id: OTHER_PARK_ID, name: 'Other Park' },
        ],
      },
    ],
    entities: overrides.entities ?? new Map([
      [PARK_ID, ok(entity(PARK_ID, 'Test Park'))],
      [OTHER_PARK_ID, ok(entity(OTHER_PARK_ID, 'Other Park'))],
    ]),
    children: overrides.children ?? new Map([
      [PARK_ID, ok([{ id: RIDE_ID, name: 'Test Ride', entityType: 'ATTRACTION' }])],
      [OTHER_PARK_ID, ok([])],
    ]),
    live: overrides.live ?? new Map([
      [PARK_ID, ok([])],
      [ALIAS_ID, ok([{ id: RIDE_ID, name: 'Test Ride', entityType: 'ATTRACTION' }])],
      [OTHER_PARK_ID, ok([])],
    ]),
  };
}

describe('buildParkCatalogAudit', () => {
  it('accepts canonical UUID/slug/family identities and a live-feed alias', () => {
    const report = buildParkCatalogAudit(buildInput());

    expect(report.counts.canonicalParks).toBe(2);
    expect(report.status.authoritativeModelMatch).toBeNull();
    expect(report.upstream.missingCanonicalParks).toEqual([]);
    expect(report.upstream.unregisteredParks).toEqual([]);
    expect(report.attractions.crossParkIds).toEqual([]);
    expect(report.attractions.unresolvedLiveEntities).toEqual([]);
  });

  it('reports a canonical park missing from its supported upstream destination', () => {
    const report = buildParkCatalogAudit(buildInput({
      destinations: [
        {
          id: DESTINATION_ID,
          name: 'Test Destination',
          parks: [{ id: PARK_ID, name: 'Test Park' }],
        },
      ],
    }));

    expect(report.upstream.missingCanonicalParks).toContainEqual({
      id: OTHER_PARK_ID,
      name: 'Other Park',
      destinationId: DESTINATION_ID,
    });
  });

  it('detects attraction UUIDs assigned to more than one canonical park', () => {
    const report = buildParkCatalogAudit(buildInput({
      children: new Map([
        [PARK_ID, ok([{ id: RIDE_ID, name: 'Test Ride', entityType: 'ATTRACTION' }])],
        [OTHER_PARK_ID, ok([{ id: RIDE_ID, name: 'Test Ride', entityType: 'ATTRACTION' }])],
      ]),
    }));

    expect(report.attractions.crossParkIds).toEqual([
      {
        id: RIDE_ID,
        name: 'Test Ride',
        parks: ['Test Park', 'Other Park'],
      },
    ]);
  });

  it('rejects a missing reviewed child identity despite offsetting growth in another park', () => {
    const otherReviewedId = '66666666-6666-4666-8666-666666666666';
    const additiveId = '77777777-7777-4777-8777-777777777777';
    const report = buildParkCatalogAudit({
      ...buildInput({
        children: new Map([
          [PARK_ID, ok([])],
          [
            OTHER_PARK_ID,
            ok([
              { id: otherReviewedId, name: 'Reviewed Ride', entityType: 'ATTRACTION' },
              { id: additiveId, name: 'Additive Ride', entityType: 'ATTRACTION' },
            ]),
          ],
        ]),
        live: new Map([
          [PARK_ID, ok([])],
          [ALIAS_ID, ok([])],
          [OTHER_PARK_ID, ok([])],
        ]),
      }),
      childCatalogBaseline: {
        id: 'fixture-per-park-review',
        reviewedAt: '2026-08-14',
        parkChildIds: {
          [PARK_ID]: [RIDE_ID],
          [OTHER_PARK_ID]: [otherReviewedId],
        },
        growthPolicy: 'allow',
        shrinkPolicy: 'block-until-reviewed',
      },
    });

    expect(report.counts.attractionEntities).toBe(2);
    expect(report.childCatalogCompleteness?.review.reviewedChildEntities).toBe(2);
    expect(report.status.reviewedChildIdentityMatch).toBe(false);
    expect(report.childCatalogCompleteness?.missingReviewedChildIdentities).toEqual([
      { parkId: PARK_ID, childIds: [RIDE_ID] },
    ]);
    expect(runCatalogAuditCli(report, { io: { out: () => undefined } })).toBe(1);
  });

  it('treats duplicate names as review-only when upstream UUIDs differ', () => {
    const secondRideId = '66666666-6666-4666-8666-666666666666';
    const report = buildParkCatalogAudit(buildInput({
      children: new Map([
        [
          PARK_ID,
          ok([
            { id: RIDE_ID, name: 'Coral Meet-and-Greet', entityType: 'ATTRACTION' },
            { id: secondRideId, name: 'Coral Meet and Greet', entityType: 'SHOW' },
          ]),
        ],
        [OTHER_PARK_ID, ok([])],
      ]),
    }));

    expect(report.attractions.duplicateIdsWithinPark).toEqual([]);
    expect(report.attractions.duplicateNameGroups).toHaveLength(1);
  });

  it('reports live entities that belong to another park instead of reassigning them', () => {
    const report = buildParkCatalogAudit(buildInput({
      children: new Map([
        [PARK_ID, ok([])],
        [OTHER_PARK_ID, ok([{ id: RIDE_ID, name: 'Other Ride', entityType: 'ATTRACTION' }])],
      ]),
      live: new Map([
        [PARK_ID, ok([{ id: RIDE_ID, name: 'Other Ride', entityType: 'ATTRACTION' }])],
        [ALIAS_ID, ok([])],
        [OTHER_PARK_ID, ok([])],
      ]),
    }));

    expect(report.attractions.crossParkLiveAssignments).toEqual([
      {
        id: RIDE_ID,
        name: 'Other Ride',
        requestedParkId: PARK_ID,
        requestedParkName: 'Test Park',
        owningParks: ['Other Park'],
      },
    ]);
    expect(report.status.blockingIssueCount).toBeGreaterThan(0);
  });

  it('keeps registry-handled sibling-feed assignments visible but informational', () => {
    const handledRegistry: DestinationFamily[] = [
      {
        ...registry[0],
        destinations: [
          {
            ...registry[0].destinations[0],
            parks: registry[0].destinations[0].parks.map((park) =>
              park.id === PARK_ID ? { ...park, filterLiveDataToChildren: true } : park
            ),
          },
        ],
      },
    ];
    const report = buildParkCatalogAudit({
      ...buildInput({
        children: new Map([
          [PARK_ID, ok([])],
          [OTHER_PARK_ID, ok([{ id: RIDE_ID, name: 'Other Ride', entityType: 'ATTRACTION' }])],
        ]),
        live: new Map([
          [PARK_ID, ok([{ id: RIDE_ID, name: 'Other Ride', entityType: 'ATTRACTION' }])],
          [ALIAS_ID, ok([])],
          [OTHER_PARK_ID, ok([])],
        ]),
      }),
      registry: handledRegistry,
    });

    expect(report.attractions.registryHandledCrossParkLiveAssignments).toHaveLength(1);
    expect(report.attractions.crossParkLiveAssignments).toEqual([]);
    expect(report.status.blockingIssueCount).toBe(0);
    expect(runCatalogAuditCli(report, { io: { out: () => undefined } })).toBe(0);
  });

  it('marks feed failures incomplete and returns a non-zero CLI status', () => {
    const report = buildParkCatalogAudit(buildInput({
      children: new Map([
        [PARK_ID, { status: 503, error: 'upstream unavailable' }],
        [OTHER_PARK_ID, ok([])],
      ]),
    }));
    const output: string[] = [];

    expect(report.status.complete).toBe(false);
    expect(runCatalogAuditCli(report, { io: { out: (line) => output.push(line) } })).toBe(1);
    expect(output.join('\n')).toMatch(/complete: NO/);
    expect(output.join('\n')).toMatch(/feed failures: 1/);
  });

  it('surfaces identity mismatches and returns a non-zero CLI status', () => {
    const wrongOwner = {
      ...entity(PARK_ID, 'Test Park'),
      destinationId: OTHER_PARK_ID,
      parentId: OTHER_PARK_ID,
    };
    const report = buildParkCatalogAudit(buildInput({
      entities: new Map([
        [PARK_ID, ok(wrongOwner)],
        [OTHER_PARK_ID, ok(entity(OTHER_PARK_ID, 'Other Park'))],
      ]),
    }));

    expect(report.entities.parentMismatches).toHaveLength(1);
    expect(report.status.complete).toBe(true);
    expect(report.status.blockingIssueCount).toBeGreaterThan(0);
    expect(runCatalogAuditCli(report, { io: { out: () => undefined } })).toBe(1);
  });
});
