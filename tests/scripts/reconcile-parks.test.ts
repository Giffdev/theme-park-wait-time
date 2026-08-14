/**
 * Coverage for scripts/reconcile-parks.ts — the cleanup/parity tooling for
 * the Firestore `parks` collection.
 *
 * Production evidence under test: `parks` contains two documents claiming
 * slug "oceans-of-fun" — the retired locally-fabricated virtual park
 * (951987f7-3387-4221-8368-2859469aebcd) and the real upstream entity that
 * park-registry.ts points at (b5a89552-3381-47ad-88cc-ab0087019c8b). The
 * park-detail page resolves parks with an unordered
 * `where('slug', '==', ...)` query, so the retired document can (and does)
 * win. `seed-parks.ts` writes with `{ merge: true }` and can therefore never
 * remove the stale document.
 *
 * These tests pin the review-only safety properties:
 *  - only registry-unknown docs inside a seeded destination that shadow a
 *    canonical park's slug are ever proposed as retirement evidence,
 *  - an intentional extra park (outside the seeded destinations, or the only
 *    doc serving its slug) is never proposed for retirement,
 *  - registry slug drift (Islands of Adventure) is reported for reseeding,
 *    never automatic cleanup,
 *  - the plan is idempotent, and
 *  - slug uniqueness / registry parity is surfaced explicitly.
 */
import { describe, it, expect, vi } from 'vitest';

// Both scripts import the real Firebase Admin module at load time; mock it so
// only the pure planning logic runs.
vi.mock('../../src/lib/firebase/admin', () => ({
  adminDb: {},
  adminApp: {},
}));

import {
  planParkReconciliation,
  formatPlan,
  buildJsonReport,
  runReconcileCli,
  ORPHANED_PARK_DATA_PATHS,
  type ParkDocRecord,
  type ReconcileIo,
} from '../../scripts/reconcile-parks';
import { SEED_DESTINATION_IDS } from '../../scripts/seed-parks';
import { DESTINATION_FAMILIES } from '@/lib/parks/park-registry';

const WORLDS_OF_FUN_DESTINATION_ID = 'c4231018-dc6f-4d8d-bfc2-7a21a6c9e9fa';
const WORLDS_OF_FUN_PARK_ID = 'bb731eae-7bd3-4713-bd7b-89d79b031743';
const OCEANS_OF_FUN_CURRENT_ID = 'b5a89552-3381-47ad-88cc-ab0087019c8b';
const OCEANS_OF_FUN_RETIRED_VIRTUAL_ID = '951987f7-3387-4221-8368-2859469aebcd';
const OKC_CURRENT_ID = '3964ae15-a1a8-41a1-aea9-23b456e2911f';
const OKC_RETIRED_ID = 'aa8c2744-b792-4802-8a70-8bba51bc73da';
const UNIVERSAL_ORLANDO_DESTINATION_ID = '89db5d43-c434-4097-b71f-f6869f495a22';
const ISLANDS_OF_ADVENTURE_PARK_ID = '267615cc-8943-4c2a-ae2c-5da728ca591f';

function productionOceansOfFunDocs(): ParkDocRecord[] {
  return [
    {
      docId: WORLDS_OF_FUN_PARK_ID,
      id: WORLDS_OF_FUN_PARK_ID,
      slug: 'worlds-of-fun',
      name: 'Worlds of Fun',
      destinationId: WORLDS_OF_FUN_DESTINATION_ID,
    },
    {
      docId: OCEANS_OF_FUN_CURRENT_ID,
      id: OCEANS_OF_FUN_CURRENT_ID,
      slug: 'oceans-of-fun',
      name: 'Oceans of Fun',
      destinationId: WORLDS_OF_FUN_DESTINATION_ID,
    },
    {
      docId: OCEANS_OF_FUN_RETIRED_VIRTUAL_ID,
      id: OCEANS_OF_FUN_RETIRED_VIRTUAL_ID,
      slug: 'oceans-of-fun',
      name: 'Oceans of Fun',
      destinationId: WORLDS_OF_FUN_DESTINATION_ID,
      isVirtual: true,
      sourceApiParkId: WORLDS_OF_FUN_PARK_ID,
    },
  ];
}

describe('planParkReconciliation — retired duplicate cleanup', () => {
  it('proposes exactly the retired virtual Oceans of Fun doc for review', () => {
    const plan = planParkReconciliation(productionOceansOfFunDocs());

    expect(plan.retire.map((f) => f.docId)).toEqual([OCEANS_OF_FUN_RETIRED_VIRTUAL_ID]);
    expect(plan.retire[0].reason).toMatch(/serves slug "oceans-of-fun"/);
    expect(plan.keep.map((f) => f.docId).sort()).toEqual(
      [WORLDS_OF_FUN_PARK_ID, OCEANS_OF_FUN_CURRENT_ID].sort()
    );
  });

  it('never proposes the canonical registry document for retirement', () => {
    const plan = planParkReconciliation(productionOceansOfFunDocs());
    expect(plan.retire.map((f) => f.docId)).not.toContain(OCEANS_OF_FUN_CURRENT_ID);
    expect(plan.retire.map((f) => f.docId)).not.toContain(WORLDS_OF_FUN_PARK_ID);
  });

  it('is idempotent after the retired identity is absent', () => {
    const remaining = productionOceansOfFunDocs().filter(
      (doc) => doc.docId !== OCEANS_OF_FUN_RETIRED_VIRTUAL_ID
    );
    const plan = planParkReconciliation(remaining);

    expect(plan.retire).toEqual([]);
    expect(plan.slugConflicts).toEqual([]);
  });

  it('retires an evidence-backed replacement even outside the seeded destinations', () => {
    const docs: ParkDocRecord[] = [
      {
        docId: OKC_CURRENT_ID,
        id: OKC_CURRENT_ID,
        slug: 'hurricane-harbor-oklahoma-city',
        name: 'Hurricane Harbor Oklahoma City',
        destinationId: '264d93c9-815b-4aa1-99a9-874d4afc2fd6',
      },
      {
        docId: OKC_RETIRED_ID,
        id: OKC_RETIRED_ID,
        slug: 'hurricane-harbor-oklahoma-city',
        name: 'Hurricane Harbor Oklahoma City!',
        destinationId: '264d93c9-815b-4aa1-99a9-874d4afc2fd6',
      },
    ];

    const plan = planParkReconciliation(docs);

    expect(plan.retire.map((finding) => finding.docId)).toEqual([OKC_RETIRED_ID]);
    expect(plan.retire[0].reason).toContain(OKC_CURRENT_ID);
  });

  it('reports the duplicate slug and which document is canonical', () => {
    const plan = planParkReconciliation(productionOceansOfFunDocs());

    expect(plan.slugConflicts).toEqual([
      {
        slug: 'oceans-of-fun',
        docIds: [OCEANS_OF_FUN_CURRENT_ID, OCEANS_OF_FUN_RETIRED_VIRTUAL_ID],
        canonicalDocId: OCEANS_OF_FUN_CURRENT_ID,
      },
    ]);
  });
});

describe('planParkReconciliation — retirement review safety', () => {
  it('leaves an unknown park outside the seeded destinations untouched', () => {
    const docs: ParkDocRecord[] = [
      {
        docId: 'manually-added-park',
        id: 'manually-added-park',
        slug: 'a-park-we-added-by-hand',
        name: 'Manually Added Park',
        destinationId: '00000000-0000-0000-0000-000000000000',
      },
    ];

    const plan = planParkReconciliation(docs);

    expect(plan.retire).toEqual([]);
    expect(plan.review).toHaveLength(1);
    expect(plan.review[0].reason).toMatch(/outside the seeded destinations/i);
  });

  it('leaves an unknown park that is the only document for its slug untouched', () => {
    const docs: ParkDocRecord[] = [
      {
        docId: 'some-new-upstream-park',
        id: 'some-new-upstream-park',
        slug: 'some-new-upstream-park',
        name: 'Some New Upstream Park',
        destinationId: WORLDS_OF_FUN_DESTINATION_ID,
      },
    ];

    const plan = planParkReconciliation(docs);

    expect(plan.retire).toEqual([]);
    expect(plan.review[0].reason).toMatch(/only document serving its slug/i);
  });

  it('reports registry slug drift for reseeding, never retirement', () => {
    const docs: ParkDocRecord[] = [
      {
        docId: ISLANDS_OF_ADVENTURE_PARK_ID,
        id: ISLANDS_OF_ADVENTURE_PARK_ID,
        slug: 'universal-islands-of-adventure',
        name: 'Islands of Adventure',
        destinationId: UNIVERSAL_ORLANDO_DESTINATION_ID,
      },
    ];

    const plan = planParkReconciliation(docs);

    expect(plan.retire).toEqual([]);
    expect(plan.review).toHaveLength(1);
    expect(plan.review[0].docId).toBe(ISLANDS_OF_ADVENTURE_PARK_ID);
    expect(plan.review[0].reason).toMatch(/registry expects "islands-of-adventure"/);
    expect(plan.review[0].reason).toMatch(/never by deleting/i);
  });

  it('never proposes retirement for a fully reconciled collection', () => {
    const docs: ParkDocRecord[] = DESTINATION_FAMILIES.flatMap((family) =>
      family.destinations
        .filter((dest) => SEED_DESTINATION_IDS.includes(dest.id))
        .flatMap((dest) =>
          dest.parks.map((park) => ({
            docId: park.id,
            id: park.id,
            slug: park.slug,
            name: park.name,
            destinationId: dest.id,
          }))
        )
    );

    const plan = planParkReconciliation(docs);

    expect(plan.retire).toEqual([]);
    expect(plan.review).toEqual([]);
    expect(plan.slugConflicts).toEqual([]);
    expect(plan.missingCanonicalSlugs).toEqual([]);
  });
});

describe('planParkReconciliation — registry parity reporting', () => {
  it('reports seeded registry parks that have no document for their canonical slug', () => {
    const plan = planParkReconciliation([
      {
        docId: ISLANDS_OF_ADVENTURE_PARK_ID,
        id: ISLANDS_OF_ADVENTURE_PARK_ID,
        slug: 'universal-islands-of-adventure',
        name: 'Islands of Adventure',
        destinationId: UNIVERSAL_ORLANDO_DESTINATION_ID,
      },
    ]);

    // The canonical-slug doc the deferred next.config.ts redirect waits on.
    expect(plan.missingCanonicalSlugs).toContainEqual({
      parkId: ISLANDS_OF_ADVENTURE_PARK_ID,
      slug: 'islands-of-adventure',
      name: 'Islands of Adventure',
    });
  });

  it('does not report parks from destinations we never seed as missing', () => {
    const plan = planParkReconciliation([]);
    const seededDestinationIds = new Set(SEED_DESTINATION_IDS);
    const unseededSlugs = new Set(
      DESTINATION_FAMILIES.flatMap((family) =>
        family.destinations
          .filter((dest) => !seededDestinationIds.has(dest.id))
          .flatMap((dest) => dest.parks.map((park) => park.slug))
      )
    );

    for (const missing of plan.missingCanonicalSlugs) {
      // A slug can legitimately belong to both a seeded and an unseeded
      // destination only if the registry duplicated it; parity is asserted
      // elsewhere. Here: nothing reported may be *exclusively* unseeded.
      const seededSlugs = new Set(
        DESTINATION_FAMILIES.flatMap((family) =>
          family.destinations
            .filter((dest) => seededDestinationIds.has(dest.id))
            .flatMap((dest) => dest.parks.map((park) => park.slug))
        )
      );
      expect(unseededSlugs.has(missing.slug) && !seededSlugs.has(missing.slug)).toBe(false);
    }
  });

  it('formats a human-readable, secret-free plan summary', () => {
    const output = formatPlan(planParkReconciliation(productionOceansOfFunDocs()));

    expect(output).toContain('retire candidates');
    expect(output).toContain(OCEANS_OF_FUN_RETIRED_VIRTUAL_ID);
    expect(output).toContain('oceans-of-fun');
  });
});

/** Captures stdout/stderr separately so the output contract can be asserted. */
function captureIo(): ReconcileIo & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    out: (line: string) => stdout.push(line),
    err: (line: string) => stderr.push(line),
  };
}

describe('reconcile-parks CLI — output contract', () => {
  it('emits nothing but a single parseable JSON document on stdout in --json mode', async () => {
    const io = captureIo();

    const exitCode = await runReconcileCli({
      argv: ['--json'],
      docs: productionOceansOfFunDocs(),
      io,
    });

    expect(exitCode).toBe(0);
    // Exactly one JSON document, and nothing else, so `--json | jq` is safe.
    expect(io.stdout).toHaveLength(1);
    const parsed = JSON.parse(io.stdout.join('\n'));
    expect(parsed.retire.map((f: { docId: string }) => f.docId)).toEqual([
      OCEANS_OF_FUN_RETIRED_VIRTUAL_ID,
    ]);
    expect(parsed.applied).toBeNull();
  });

  it('keeps the dry-run notice off stdout (stderr only)', async () => {
    const io = captureIo();

    await runReconcileCli({ argv: ['--json'], docs: productionOceansOfFunDocs(), io });

    expect(io.stdout.join('\n')).not.toMatch(/Dry run only/);
    expect(io.stderr.join('\n')).toMatch(/Dry run only/);
    expect(io.stderr.join('\n')).toMatch(/reconcile:park-catalog/);
    expect(io.stderr.join('\n')).not.toMatch(/Re-run with `--apply --yes`/);
    // Guard the contract directly: stdout must parse even with the notice emitted.
    expect(() => JSON.parse(io.stdout.join('\n'))).not.toThrow();
  });

  it('still prints the human-readable plan on stdout in text mode', async () => {
    const io = captureIo();

    await runReconcileCli({ argv: [], docs: productionOceansOfFunDocs(), io });

    expect(io.stdout.join('\n')).toContain('=== Firestore `parks` reconciliation ===');
    expect(io.stderr.join('\n')).toMatch(/Dry run only/);
  });

  it('reports the park-id-keyed data a future tombstone migration must handle', async () => {
    const textIo = captureIo();
    await runReconcileCli({ argv: [], docs: productionOceansOfFunDocs(), io: textIo });
    const text = textIo.stdout.join('\n');

    expect(text).toContain('future tombstone/rules migration scope');
    expect(text).toContain('attractions/* where parkId == {parkId}');
    expect(text).toContain('waitTimes/{parkId}');

    const jsonIo = captureIo();
    await runReconcileCli({ argv: ['--json'], docs: productionOceansOfFunDocs(), io: jsonIo });
    const parsed = JSON.parse(jsonIo.stdout.join('\n'));
    expect(parsed.orphanedCollections).toEqual([...ORPHANED_PARK_DATA_PATHS]);
    expect(parsed.orphanedCollections.length).toBeGreaterThan(0);
  });

  it('marks the JSON report as permanently non-destructive', () => {
    const plan = planParkReconciliation(productionOceansOfFunDocs());
    const report = buildJsonReport(plan);

    expect(report.orphanedCollections).toEqual([...ORPHANED_PARK_DATA_PATHS]);
    expect(report.automaticDeletionEnabled).toBe(false);
    expect(report.applied).toBeNull();
  });
});

describe('reconcile-parks CLI — deletion is disabled', () => {
  it.each([
    ['--apply'],
    ['--apply', '--yes'],
    ['--apply', '--yes', '--json'],
  ])('refuses %s because no delete path exists', async (...argv) => {
    const io = captureIo();

    const exitCode = await runReconcileCli({
      argv,
      docs: productionOceansOfFunDocs(),
      io,
    });

    expect(exitCode).toBe(1);
    expect(io.stderr.join('\n')).toMatch(/automatic catalog deletion is disabled/i);
  });

  it('cannot delete the retired Oklahoma City document even when it is planned', async () => {
    const io = captureIo();
    const docs: ParkDocRecord[] = [
      {
        docId: OKC_CURRENT_ID,
        id: OKC_CURRENT_ID,
        slug: 'hurricane-harbor-oklahoma-city',
        name: 'Hurricane Harbor Oklahoma City',
        destinationId: '264d93c9-815b-4aa1-99a9-874d4afc2fd6',
      },
      {
        docId: OKC_RETIRED_ID,
        id: OKC_RETIRED_ID,
        slug: 'hurricane-harbor-oklahoma-city',
        name: 'Hurricane Harbor Oklahoma City!',
        destinationId: '264d93c9-815b-4aa1-99a9-874d4afc2fd6',
      },
    ];

    expect(planParkReconciliation(docs).retire.map((finding) => finding.docId)).toContain(
      OKC_RETIRED_ID
    );
    expect(
      await runReconcileCli({ argv: ['--apply', '--yes'], docs, io })
    ).toBe(1);
  });
});
