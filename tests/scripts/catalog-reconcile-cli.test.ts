import { describe, expect, it, vi } from 'vitest';
import { unlink } from 'node:fs/promises';

vi.mock('../../src/lib/firebase/admin', () => ({
  adminDb: {},
  adminApp: {},
}));

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    fromDate: (date: Date) => ({ iso: date.toISOString() }),
  },
}));

import {
  MAX_ATOMIC_WRITE_ACTIONS,
  assertSafeUpsertManifest,
  bindCatalogApprovalDigests,
  buildCatalogManifest,
  evaluateChildCatalogCompleteness,
  fetchJsonWithRetry,
  fetchUpstreamCatalog,
  loadCatalogManifestArtifact,
  runCatalogReconcileCli,
  saveCatalogManifestArtifact,
  type CatalogHttpResponse,
  type CatalogManifest,
} from '../../scripts/reconcile-park-catalog';
import type { DestinationFamily } from '@/lib/parks/park-registry';

const PARK_ID = 'b5a89552-3381-47ad-88cc-ab0087019c8b';
const DESTINATION_ID = 'c4231018-dc6f-4d8d-bfc2-7a21a6c9e9fa';
const RIDE_ID = '55555555-5555-4555-8555-555555555555';
const SECOND_RIDE_ID = '66666666-6666-4666-8666-666666666666';
const MANIFEST_FILE = `tests\\scripts\\.reviewed-catalog-manifest-${process.pid}.json`;
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

const PARK_METADATA = {
  entityType: 'PARK' as const,
  parentId: DESTINATION_ID,
  timezone: 'America/Chicago',
  location: { latitude: 39.1, longitude: -94.5 },
};
const STORED_PARK_METADATA = {
  entityType: 'PARK' as const,
  parentId: DESTINATION_ID,
  timezone: 'America/Chicago',
  location: { lat: 39.1, lng: -94.5 },
  firestoreUpdateTime: FIRESTORE_UPDATE_TIME,
};

function completeness(childIds: string[]) {
  return evaluateChildCatalogCompleteness(
    { ...TEST_CHILD_REVIEW, parkChildIds: { [PARK_ID]: [] } },
    [PARK_ID],
    new Map([[PARK_ID, childIds]])
  );
}

function completeManifest(): CatalogManifest {
  return buildCatalogManifest({
    parks: [
      {
        docId: PARK_ID,
        id: PARK_ID,
        name: 'Drifted Oceans',
        slug: 'oceans-of-fun',
        ...STORED_PARK_METADATA,
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
        ...STORED_PARK_METADATA,
      },
    ],
    upstreamAttractions: [],
    upstreamCompleteness: completeness([]),
    generatedAt: '2026-08-14T19:00:00.000Z',
  });
}

function io() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    out: (line: string) => stdout.push(line),
    err: (line: string) => stderr.push(line),
  };
}

const oneParkRegistry: DestinationFamily[] = [
  {
    familyId: 'fixture-family',
    familyName: 'Fixture Family',
    destinations: [
      {
        id: DESTINATION_ID,
        name: 'Worlds of Fun',
        slug: 'worlds-of-fun',
        parks: [{ id: PARK_ID, name: 'Oceans of Fun', slug: 'oceans-of-fun' }],
      },
    ],
  },
];

function okResponse(data: unknown): CatalogHttpResponse {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => data,
  };
}

function upstreamTransport(childPayload: unknown) {
  return vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('/destinations')) {
      return okResponse({
        destinations: [
          {
            id: DESTINATION_ID,
            name: 'Worlds of Fun',
            parks: [{ id: PARK_ID, name: 'Oceans of Fun', slug: 'oceans-of-fun' }],
          },
        ],
      });
    }
    if (url.endsWith('/children')) return okResponse(childPayload);
    return okResponse({
      id: PARK_ID,
      name: 'Oceans of Fun',
      entityType: 'PARK',
      destinationId: DESTINATION_ID,
      parentId: DESTINATION_ID,
      timezone: 'America/Chicago',
      location: { latitude: 39.1, longitude: -94.5 },
    });
  });
}

function manifestFromUpstream(
  upstream: Awaited<ReturnType<typeof fetchUpstreamCatalog>>
): CatalogManifest {
  return buildCatalogManifest({
    parks: [
      {
        docId: PARK_ID,
        id: PARK_ID,
        name: 'Oceans of Fun',
        slug: 'oceans-of-fun',
        destinationId: DESTINATION_ID,
        destinationName: 'Worlds of Fun',
        ...PARK_METADATA,
      },
    ],
    attractions: [],
    upstreamParks: upstream.parks,
    upstreamAttractions: upstream.attractions,
    upstreamFetchFailures: upstream.failures,
    upstreamIdentityMismatches: upstream.identityMismatches,
    upstreamCompleteness: upstream.completeness,
    generatedAt: '2026-08-14T19:00:00.000Z',
  });
}

describe('catalog reconcile CLI safety', () => {
  it('is dry-run by default and never calls an apply store', async () => {
    const output = io();
    const apply = vi.fn();

    const exitCode = await runCatalogReconcileCli({
      argv: ['--json'],
      loadManifest: async () => completeManifest(),
      applyUpsertManifest: apply,
      io: output,
    });

    expect(exitCode).toBe(0);
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(output.stdout[0]).applied).toBeNull();
  });

  it('applies the exact reviewed dry-run artifact across invocations with different clocks', async () => {
    const reviewed = completeManifest();
    const dryRunOutput = io();
    try {
      expect(
        await runCatalogReconcileCli({
          argv: ['--json', '--manifest-file', MANIFEST_FILE],
          loadManifest: async () => reviewed,
          saveManifestArtifact: saveCatalogManifestArtifact,
          io: dryRunOutput,
        })
      ).toBe(0);

      const regeneratedAtLaterClock = completeManifest();
      regeneratedAtLaterClock.generatedAt = '2026-08-14T20:00:00.000Z';
      for (const action of regeneratedAtLaterClock.parks.updates) {
        action.writeTimestamp = regeneratedAtLaterClock.generatedAt;
      }
      bindCatalogApprovalDigests(regeneratedAtLaterClock);
      const rebuildManifest = vi.fn(async () => regeneratedAtLaterClock);
      const apply = vi.fn().mockResolvedValue(undefined);
      const reviewedPhase = reviewed.migration.upsertPhases.find(
        (phase) => phase.id === 'parks'
      )!;

      expect(
        await runCatalogReconcileCli({
          argv: [
            '--apply-upserts',
            '--yes',
            '--manifest-file',
            MANIFEST_FILE,
            '--manifest-id',
            reviewed.migration.id,
            '--phase',
            'parks',
            '--phase-digest',
            reviewedPhase.approvalDigest,
          ],
          loadManifest: rebuildManifest,
          loadManifestArtifact: loadCatalogManifestArtifact,
          applyUpsertManifest: apply,
          io: io(),
        })
      ).toBe(0);
      expect(rebuildManifest).not.toHaveBeenCalled();
      expect(apply).toHaveBeenCalledWith(
        expect.objectContaining({ generatedAt: '2026-08-14T19:00:00.000Z' }),
        'parks'
      );
    } finally {
      await unlink(MANIFEST_FILE).catch(() => undefined);
    }
  });

  it('requires explicit --apply-upserts --yes before invoking the upsert store', async () => {
    const output = io();
    const apply = vi.fn().mockResolvedValue(undefined);
    const manifest = completeManifest();

    expect(
      await runCatalogReconcileCli({
        argv: [
          '--apply-upserts',
          '--yes',
          '--manifest-file',
          MANIFEST_FILE,
          '--manifest-id',
          manifest.migration.id,
          '--phase',
          'parks',
          '--phase-digest',
          manifest.migration.upsertPhases.find((phase) => phase.id === 'parks')!
            .approvalDigest,
          '--json',
        ],
        loadManifest: async () => manifest,
        loadManifestArtifact: async () => manifest,
        applyUpsertManifest: apply,
        io: output,
      })
    ).toBe(0);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(JSON.parse(output.stdout[0]).applied).toMatchObject({ parkUpserts: 1 });
  });

  it('reports a successful phased apply accurately in text mode', async () => {
    const output = io();
    const apply = vi.fn().mockResolvedValue(undefined);
    const manifest = completeManifest();

    expect(
      await runCatalogReconcileCli({
        argv: [
          '--apply-upserts',
          '--yes',
          '--manifest-file',
          MANIFEST_FILE,
          '--manifest-id',
          manifest.migration.id,
          '--phase',
          'parks',
          '--phase-digest',
          manifest.migration.upsertPhases.find((phase) => phase.id === 'parks')!
            .approvalDigest,
        ],
        loadManifest: async () => manifest,
        loadManifestArtifact: async () => manifest,
        applyUpsertManifest: apply,
        io: output,
      })
    ).toBe(0);
    expect(output.stdout.join('\n')).toMatch(/Applied upsert phase parks/i);
    expect(output.stdout.join('\n')).not.toMatch(/Dry run only/i);
  });

  it('rejects an apply without the reviewed manifest id before loading or writing', async () => {
    const output = io();
    const loadManifest = vi.fn();
    const apply = vi.fn();

    expect(
      await runCatalogReconcileCli({
        argv: [
          '--apply-upserts',
          '--yes',
          '--phase',
          'parks',
          '--phase-digest',
          'reviewed-phase-digest',
        ],
        loadManifest,
        applyUpsertManifest: apply,
        io: output,
      })
    ).toBe(1);
    expect(loadManifest).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(output.stderr.join('\n')).toMatch(/manifest-id/i);
  });

  it('rejects an apply without the exact reviewed manifest artifact', async () => {
    const output = io();
    const loadManifest = vi.fn();

    expect(
      await runCatalogReconcileCli({
        argv: [
          '--apply-upserts',
          '--yes',
          '--manifest-id',
          'target-id',
          '--phase',
          'parks',
          '--phase-digest',
          'reviewed-phase-digest',
        ],
        loadManifest,
        io: output,
      })
    ).toBe(1);
    expect(loadManifest).not.toHaveBeenCalled();
    expect(output.stderr.join('\n')).toMatch(/manifest-file/i);
  });

  it('rejects an upsert apply without its phase-specific approval digest', async () => {
    const output = io();
    const loadManifest = vi.fn();

    expect(
      await runCatalogReconcileCli({
        argv: [
          '--apply-upserts',
          '--yes',
          '--manifest-file',
          MANIFEST_FILE,
          '--manifest-id',
          'target-id',
          '--phase',
          'parks',
        ],
        loadManifest,
        io: output,
      })
    ).toBe(1);
    expect(loadManifest).not.toHaveBeenCalled();
    expect(output.stderr.join('\n')).toMatch(/phase-digest/i);
  });

  it('rejects a stale phase digest when Firestore preconditions changed', async () => {
    const output = io();
    const apply = vi.fn();
    const manifest = completeManifest();

    expect(
      await runCatalogReconcileCli({
        argv: [
          '--apply-upserts',
          '--yes',
          '--manifest-file',
          MANIFEST_FILE,
          '--manifest-id',
          manifest.migration.id,
          '--phase',
          'parks',
          '--phase-digest',
          'stale-phase-digest',
        ],
        loadManifest: async () => manifest,
        loadManifestArtifact: async () => manifest,
        applyUpsertManifest: apply,
        io: output,
      })
    ).toBe(1);
    expect(apply).not.toHaveBeenCalled();
    expect(output.stderr.join('\n')).toMatch(/does not match current phase/i);
  });

  it('rejects approval reviewed for a different persisted write timestamp', async () => {
    const output = io();
    const apply = vi.fn();
    const manifest = completeManifest();
    const reviewedDigest = manifest.migration.upsertPhases.find(
      (phase) => phase.id === 'parks'
    )!.approvalDigest;
    manifest.generatedAt = '2026-08-14T19:05:00.000Z';
    for (const action of manifest.parks.updates) {
      action.writeTimestamp = manifest.generatedAt;
    }
    bindCatalogApprovalDigests(manifest);

    expect(
      await runCatalogReconcileCli({
        argv: [
          '--apply-upserts',
          '--yes',
          '--manifest-file',
          MANIFEST_FILE,
          '--manifest-id',
          manifest.migration.id,
          '--phase',
          'parks',
          '--phase-digest',
          reviewedDigest,
        ],
        loadManifest: async () => manifest,
        loadManifestArtifact: async () => manifest,
        applyUpsertManifest: apply,
        io: output,
      })
    ).toBe(1);
    expect(apply).not.toHaveBeenCalled();
    expect(output.stderr.join('\n')).toMatch(/does not match current phase/i);
  });

  it.each([
    ['delete apply flag', ['--apply-deletes', '--yes']],
    ['delete digest flag', ['--delete-digest', 'reviewed-delete-digest']],
    [
      'combined upsert/delete flags',
      ['--apply-upserts', '--apply-deletes', '--yes'],
    ],
  ])('rejects the legacy %s before loading a manifest or writing', async (_label, argv) => {
    const output = io();
    const loadManifest = vi.fn();
    const apply = vi.fn();

    expect(
      await runCatalogReconcileCli({
        argv,
        loadManifest,
        applyUpsertManifest: apply,
        io: output,
      })
    ).toBe(1);
    expect(loadManifest).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(output.stderr.join('\n')).toMatch(/automatic deletion is disabled/i);
  });

  it('reports manifest-load failures safely on stderr with a non-zero exit', async () => {
    const output = io();

    expect(
      await runCatalogReconcileCli({
        argv: ['--json'],
        loadManifest: async () => {
          throw new Error(
            'Firestore manifest unavailable token=super-secret https://private.example/catalog'
          );
        },
        io: output,
      })
    ).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr.join('\n')).toMatch(/manifest load failed.*unavailable/i);
    expect(output.stderr.join('\n')).toContain('token=[redacted]');
    expect(output.stderr.join('\n')).toContain('[redacted-url]');
    expect(output.stderr.join('\n')).not.toContain('super-secret');
    expect(output.stderr.join('\n')).not.toContain('private.example');
  });

  it('accepts an over-400 full migration only as bounded deterministic phases', async () => {
    const output = io();
    const apply = vi.fn().mockResolvedValue(undefined);
    const upstreamAttractions = Array.from(
      { length: MAX_ATOMIC_WRITE_ACTIONS + 1 },
      (_, index) => ({
        id: `ride-${String(index).padStart(3, '0')}`,
        name: `Ride ${index}`,
        parkId: PARK_ID,
        parkName: 'Oceans of Fun',
        entityType: 'ATTRACTION',
      })
    );
    const manifest = buildCatalogManifest({
      parks: [
        {
          docId: PARK_ID,
          id: PARK_ID,
          name: 'Oceans of Fun',
          slug: 'oceans-of-fun',
          destinationId: 'c4231018-dc6f-4d8d-bfc2-7a21a6c9e9fa',
          destinationName: 'Worlds of Fun',
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
          ...PARK_METADATA,
        },
      ],
      upstreamAttractions,
      upstreamCompleteness: completeness(upstreamAttractions.map((attraction) => attraction.id)),
      generatedAt: '2026-08-14T19:00:00.000Z',
    });

    const attractionPhase = manifest.migration.upsertPhases.find(
      (phase) => phase.kind === 'attractions' && phase.pendingActionCount > 0
    )!;
    manifest.parks.updates = [];
    manifest.migration.upsertPhases.find((phase) => phase.id === 'parks')!.pendingActionCount = 0;

    expect(
      await runCatalogReconcileCli({
        argv: [
          '--apply-upserts',
          '--yes',
          '--manifest-file',
          MANIFEST_FILE,
          '--manifest-id',
          manifest.migration.id,
          '--phase',
          attractionPhase.id,
          '--phase-digest',
          attractionPhase.approvalDigest,
        ],
        loadManifest: async () => manifest,
        loadManifestArtifact: async () => manifest,
        applyUpsertManifest: apply,
        io: output,
      })
    ).toBe(0);
    expect(attractionPhase.pendingActionCount).toBeLessThanOrEqual(MAX_ATOMIC_WRITE_ACTIONS);
    expect(apply).toHaveBeenCalledWith(manifest, attractionPhase.id);
  });

  it('blocks attraction upserts when any canonical feed is incomplete', async () => {
    const output = io();
    const apply = vi.fn();
    const manifest = completeManifest();
    manifest.source.complete = false;
    manifest.source.upstreamFetchFailures.push({
      stage: 'children',
      parkId: PARK_ID,
      status: 503,
      attempts: 4,
      error: 'HTTP 503',
    });

    expect(
      await runCatalogReconcileCli({
        argv: [
          '--apply-upserts',
          '--yes',
          '--manifest-file',
          MANIFEST_FILE,
          '--manifest-id',
          manifest.migration.id,
          '--phase',
          'parks',
          '--phase-digest',
          manifest.migration.upsertPhases.find((phase) => phase.id === 'parks')!
            .approvalDigest,
        ],
        loadManifest: async () => manifest,
        loadManifestArtifact: async () => manifest,
        applyUpsertManifest: apply,
        io: output,
      })
    ).toBe(1);
    expect(apply).not.toHaveBeenCalled();
    expect(output.stderr.join('\n')).toMatch(/incomplete/i);
  });
});

describe('canonical child-feed validation and reviewed completeness', () => {
  const reviewedOneChild = {
    ...TEST_CHILD_REVIEW,
    parkChildIds: { [PARK_ID]: [RIDE_ID] },
  };

  it('validates and carries the actual upstream park entity metadata schema', async () => {
    const transport = upstreamTransport({ children: [] });
    transport.mockImplementation(async (url: string) => {
      if (url.endsWith('/destinations')) {
        return okResponse({
          destinations: [
            {
              id: DESTINATION_ID,
              name: 'Worlds of Fun',
              parks: [{ id: PARK_ID, name: 'Oceans of Fun', slug: 'oceans-of-fun' }],
            },
          ],
        });
      }
      if (url.endsWith('/children')) return okResponse({ children: [] });
      return okResponse({
        id: PARK_ID,
        name: 'Oceans of Fun',
        entityType: 'PARK',
        parentId: DESTINATION_ID,
        destinationId: DESTINATION_ID,
        timezone: 'America/Chicago',
        location: { latitude: 39.1746, longitude: -94.4886 },
        externalId: 'enchantedparks_park_OOF',
        tags: [{ tag: 'operator', tagName: 'Operator', value: 'Six Flags' }],
      });
    });
    const upstream = await fetchUpstreamCatalog({
      registry: oneParkRegistry,
      childCatalogBaseline: TEST_CHILD_REVIEW,
      transport,
      attempts: 1,
    });

    expect(upstream.identityMismatches).toEqual([]);
    expect(upstream.parks[0]).toMatchObject({
      entityType: 'PARK',
      parentId: DESTINATION_ID,
      timezone: 'America/Chicago',
      location: { latitude: 39.1746, longitude: -94.4886 },
      externalId: 'enchantedparks_park_OOF',
      tags: [{ tag: 'operator', tagName: 'Operator', value: 'Six Flags' }],
    });
  });

  it('rejects a park entity whose required location metadata is absent', async () => {
    const transport = upstreamTransport({ children: [] });
    transport.mockImplementation(async (url: string) => {
      if (url.endsWith('/destinations')) {
        return okResponse({
          destinations: [
            {
              id: DESTINATION_ID,
              name: 'Worlds of Fun',
              parks: [{ id: PARK_ID, name: 'Oceans of Fun' }],
            },
          ],
        });
      }
      if (url.endsWith('/children')) return okResponse({ children: [] });
      return okResponse({
        id: PARK_ID,
        name: 'Oceans of Fun',
        entityType: 'PARK',
        parentId: DESTINATION_ID,
        destinationId: DESTINATION_ID,
        timezone: 'America/Chicago',
      });
    });
    const upstream = await fetchUpstreamCatalog({
      registry: oneParkRegistry,
      childCatalogBaseline: TEST_CHILD_REVIEW,
      transport,
      attempts: 1,
    });

    expect(upstream.parks).toEqual([]);
    expect(upstream.identityMismatches[0].reason).toMatch(/location/i);
  });

  it('rejects an HTTP 200 response without the required children array', async () => {
    const upstream = await fetchUpstreamCatalog({
      registry: oneParkRegistry,
      childCatalogBaseline: reviewedOneChild,
      transport: upstreamTransport({ data: [] }),
      attempts: 1,
    });

    expect(upstream.failures).toContainEqual(
      expect.objectContaining({
        stage: 'children',
        parkId: PARK_ID,
        status: 200,
        error: expect.stringMatching(/children array is missing/i),
      })
    );
    expect(upstream.completeness.complete).toBe(false);
    expect(() => assertSafeUpsertManifest(manifestFromUpstream(upstream))).toThrow(
      /completeness|incomplete/i
    );
  });

  it('rejects duplicate child UUIDs within one successful feed', async () => {
    const upstream = await fetchUpstreamCatalog({
      registry: oneParkRegistry,
      childCatalogBaseline: reviewedOneChild,
      transport: upstreamTransport({
        children: [
          { id: RIDE_ID, name: 'Ride One', entityType: 'ATTRACTION' },
          { id: RIDE_ID, name: 'Ride One Duplicate', entityType: 'ATTRACTION' },
        ],
      }),
      attempts: 1,
    });

    expect(upstream.identityMismatches).toContainEqual(
      expect.objectContaining({
        parkId: PARK_ID,
        attractionId: RIDE_ID,
        reason: expect.stringMatching(/duplicated within/i),
      })
    );
    expect(upstream.completeness.validatedFeeds).toBe(0);
    expect(() => assertSafeUpsertManifest(manifestFromUpstream(upstream))).toThrow(
      /completeness|identity/i
    );
  });

  it('rejects a child with an invalid UUID in an otherwise successful feed', async () => {
    const upstream = await fetchUpstreamCatalog({
      registry: oneParkRegistry,
      childCatalogBaseline: reviewedOneChild,
      transport: upstreamTransport({
        children: [{ id: 'not-a-uuid', name: 'Broken Ride', entityType: 'ATTRACTION' }],
      }),
      attempts: 1,
    });

    expect(upstream.identityMismatches).toContainEqual(
      expect.objectContaining({
        parkId: PARK_ID,
        attractionId: 'not-a-uuid',
        reason: expect.stringMatching(/invalid UUID/i),
      })
    );
    expect(upstream.completeness.complete).toBe(false);
    expect(() => assertSafeUpsertManifest(manifestFromUpstream(upstream))).toThrow(
      /completeness|identity/i
    );
  });

  it('fails closed on a truncated HTTP 200 feed below the reviewed baseline', async () => {
    const upstream = await fetchUpstreamCatalog({
      registry: oneParkRegistry,
      childCatalogBaseline: {
        ...reviewedOneChild,
        id: 'fixture-reviewed-two',
        parkChildIds: { [PARK_ID]: [RIDE_ID, SECOND_RIDE_ID] },
      },
      transport: upstreamTransport({
        children: [{ id: RIDE_ID, name: 'Ride One', entityType: 'ATTRACTION' }],
      }),
      attempts: 1,
    });

    expect(upstream.failures).toEqual([]);
    expect(upstream.identityMismatches).toEqual([]);
    expect(upstream.completeness).toMatchObject({
      expectedFeeds: 1,
      validatedFeeds: 1,
      observedChildEntities: 1,
      complete: false,
      reason: expect.stringMatching(/missing 1 reviewed identity/i),
    });
    const truncatedManifest = buildCatalogManifest({
      parks: [
        {
          docId: PARK_ID,
          id: PARK_ID,
          name: 'Oceans of Fun',
          slug: 'oceans-of-fun',
          destinationId: DESTINATION_ID,
          destinationName: 'Worlds of Fun',
        },
      ],
      attractions: [
        {
          docId: SECOND_RIDE_ID,
          id: SECOND_RIDE_ID,
          name: 'Missing From Truncated Feed',
          parkId: PARK_ID,
        },
      ],
      upstreamParks: upstream.parks,
      upstreamAttractions: upstream.attractions,
      upstreamFetchFailures: upstream.failures,
      upstreamIdentityMismatches: upstream.identityMismatches,
      upstreamCompleteness: upstream.completeness,
      generatedAt: '2026-08-14T19:00:00.000Z',
    });
    expect(truncatedManifest.attractions.retire).toEqual([]);
    expect(truncatedManifest.attractions.review).toContainEqual(
      expect.objectContaining({ docId: SECOND_RIDE_ID })
    );
    expect(() => assertSafeUpsertManifest(truncatedManifest)).toThrow(
      /reviewed child-catalog completeness failed/i
    );
  });

  it('allows reviewed growth above the baseline', async () => {
    const upstream = await fetchUpstreamCatalog({
      registry: oneParkRegistry,
      childCatalogBaseline: reviewedOneChild,
      transport: upstreamTransport({
        children: [
          { id: RIDE_ID, name: 'Ride One', entityType: 'ATTRACTION' },
          { id: SECOND_RIDE_ID, name: 'Ride Two', entityType: 'ATTRACTION' },
        ],
      }),
      attempts: 1,
    });

    expect(upstream.completeness).toMatchObject({
      observedChildEntities: 2,
      complete: true,
    });
    expect(() => assertSafeUpsertManifest(manifestFromUpstream(upstream))).not.toThrow();
  });

  it('accepts a valid upstream parent UUID that differs from the requested park', async () => {
    const upstream = await fetchUpstreamCatalog({
      registry: oneParkRegistry,
      childCatalogBaseline: reviewedOneChild,
      transport: upstreamTransport({
        children: [
          {
            id: RIDE_ID,
            name: 'Destination-parented Show',
            entityType: 'SHOW',
            parentId: DESTINATION_ID,
            slug: null,
          },
        ],
      }),
      attempts: 1,
    });

    expect(upstream.identityMismatches).toEqual([]);
    expect(upstream.attractions).toHaveLength(1);
  });

  it('rejects a reviewed identity missing from one park even when another park offsets the total', () => {
    const otherParkId = '77777777-7777-4777-8777-777777777777';
    const otherReviewedId = '88888888-8888-4888-8888-888888888888';
    const additiveId = '99999999-9999-4999-8999-999999999999';
    const evidence = evaluateChildCatalogCompleteness(
      {
        ...TEST_CHILD_REVIEW,
        parkChildIds: {
          [PARK_ID]: [RIDE_ID],
          [otherParkId]: [otherReviewedId],
        },
      },
      [PARK_ID, otherParkId],
      new Map([
        [PARK_ID, []],
        [otherParkId, [otherReviewedId, additiveId]],
      ])
    );

    expect(evidence.observedChildEntities).toBe(2);
    expect(evidence.review.reviewedChildEntities).toBe(2);
    expect(evidence.complete).toBe(false);
    expect(evidence.missingReviewedChildIdentities).toEqual([
      { parkId: PARK_ID, childIds: [RIDE_ID] },
    ]);
  });

  it.each([
    ['object slug', { slug: { unsafe: true } }],
    ['numeric slug', { slug: 42 }],
    ['invalid slug string', { slug: 'Not A Slug' }],
    ['object entityType', { entityType: { unsafe: true } }],
    ['numeric entityType', { entityType: 42 }],
    ['unknown entityType', { entityType: 'UNKNOWN' }],
    ['object name', { name: { unsafe: true } }],
    ['numeric parentId', { parentId: 42 }],
  ])('rejects a child with malformed persisted %s metadata', async (_label, malformed) => {
    const upstream = await fetchUpstreamCatalog({
      registry: oneParkRegistry,
      childCatalogBaseline: reviewedOneChild,
      transport: upstreamTransport({
        children: [
          {
            id: RIDE_ID,
            name: 'Ride One',
            entityType: 'ATTRACTION',
            ...malformed,
          },
        ],
      }),
      attempts: 1,
    });

    expect(upstream.attractions).toEqual([]);
    expect(upstream.identityMismatches).toHaveLength(1);
    expect(upstream.completeness.complete).toBe(false);
  });
});

describe('catalog transport retries', () => {
  it('honors Retry-After before retrying a throttled feed', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const responses: CatalogHttpResponse[] = [
      {
        ok: false,
        status: 429,
        headers: { get: () => '2' },
        json: async () => ({}),
      },
      {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ children: [] }),
      },
    ];
    const transport = vi.fn().mockImplementation(async () => responses.shift()!);

    await expect(
      fetchJsonWithRetry<{ children: unknown[] }>('https://example.test/children', {
        transport,
        sleep,
        attempts: 2,
      })
    ).resolves.toEqual({ children: [] });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('does not retry a non-retryable identity response', async () => {
    const sleep = vi.fn();
    const transport = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: { get: () => null },
      json: async () => ({}),
    } satisfies CatalogHttpResponse);

    await expect(
      fetchJsonWithRetry('https://example.test/entity', { transport, sleep })
    ).rejects.toMatchObject({ status: 404, attempts: 1 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
