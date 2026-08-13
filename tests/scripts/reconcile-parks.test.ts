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
 * These tests pin the safety properties that make deletion acceptable
 * against production data:
 *  - only registry-unknown docs inside a seeded destination that shadow a
 *    canonical park's slug are ever proposed for deletion,
 *  - an intentional extra park (outside the seeded destinations, or the only
 *    doc serving its slug) is never proposed for deletion,
 *  - registry slug drift (Islands of Adventure) is reported for reseeding,
 *    never deletion,
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
  applyRetirePlan,
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
  it('proposes exactly the retired virtual Oceans of Fun doc for deletion', () => {
    const plan = planParkReconciliation(productionOceansOfFunDocs());

    expect(plan.retire.map((f) => f.docId)).toEqual([OCEANS_OF_FUN_RETIRED_VIRTUAL_ID]);
    expect(plan.retire[0].reason).toMatch(/shadows slug "oceans-of-fun"/);
    expect(plan.keep.map((f) => f.docId).sort()).toEqual(
      [WORLDS_OF_FUN_PARK_ID, OCEANS_OF_FUN_CURRENT_ID].sort()
    );
  });

  it('never proposes the canonical registry document for deletion', () => {
    const plan = planParkReconciliation(productionOceansOfFunDocs());
    expect(plan.retire.map((f) => f.docId)).not.toContain(OCEANS_OF_FUN_CURRENT_ID);
    expect(plan.retire.map((f) => f.docId)).not.toContain(WORLDS_OF_FUN_PARK_ID);
  });

  it('is idempotent: re-planning after the delete proposes nothing further', () => {
    const remaining = productionOceansOfFunDocs().filter(
      (doc) => doc.docId !== OCEANS_OF_FUN_RETIRED_VIRTUAL_ID
    );
    const plan = planParkReconciliation(remaining);

    expect(plan.retire).toEqual([]);
    expect(plan.slugConflicts).toEqual([]);
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

describe('planParkReconciliation — deletion safety', () => {
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

  it('reports registry slug drift (Islands of Adventure) for reseeding, never deletion', () => {
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

  it('never proposes deletion for a fully reconciled collection', () => {
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
    // Guard the contract directly: stdout must parse even with the notice emitted.
    expect(() => JSON.parse(io.stdout.join('\n'))).not.toThrow();
  });

  it('still prints the human-readable plan on stdout in text mode', async () => {
    const io = captureIo();

    await runReconcileCli({ argv: [], docs: productionOceansOfFunDocs(), io });

    expect(io.stdout.join('\n')).toContain('=== Firestore `parks` reconciliation ===');
    expect(io.stderr.join('\n')).toMatch(/Dry run only/);
  });

  it('reports the orphaned park-id-keyed data left behind by a delete', async () => {
    const textIo = captureIo();
    await runReconcileCli({ argv: [], docs: productionOceansOfFunDocs(), io: textIo });
    const text = textIo.stdout.join('\n');

    expect(text).toContain('deletion scope (park documents only)');
    expect(text).toContain('attractions/* where parkId == {parkId}');
    expect(text).toContain('waitTimes/{parkId}');

    const jsonIo = captureIo();
    await runReconcileCli({ argv: ['--json'], docs: productionOceansOfFunDocs(), io: jsonIo });
    const parsed = JSON.parse(jsonIo.stdout.join('\n'));
    expect(parsed.orphanedCollections).toEqual([...ORPHANED_PARK_DATA_PATHS]);
    expect(parsed.orphanedCollections.length).toBeGreaterThan(0);
  });

  it('includes the orphan notice in buildJsonReport regardless of apply state', () => {
    const plan = planParkReconciliation(productionOceansOfFunDocs());
    const report = buildJsonReport(plan, {
      attempted: 1,
      deleted: [OCEANS_OF_FUN_RETIRED_VIRTUAL_ID],
      failed: [],
    });

    expect(report.orphanedCollections).toEqual([...ORPHANED_PARK_DATA_PATHS]);
    expect(report.applied?.deleted).toEqual([OCEANS_OF_FUN_RETIRED_VIRTUAL_ID]);
  });
});

describe('reconcile-parks CLI — apply semantics', () => {
  function multiRetireDocs(): ParkDocRecord[] {
    // Two registry-retired duplicates so a mid-loop failure has a successor
    // that must still be attempted.
    return [
      ...productionOceansOfFunDocs(),
      {
        docId: 'retired-worlds-of-fun-duplicate',
        id: 'retired-worlds-of-fun-duplicate',
        slug: 'worlds-of-fun',
        name: 'Worlds of Fun (retired duplicate)',
        destinationId: WORLDS_OF_FUN_DESTINATION_ID,
      },
    ];
  }

  it('refuses to delete without an explicit --yes and exits non-zero', async () => {
    const io = captureIo();
    const deleteDoc = vi.fn().mockResolvedValue(undefined);

    const exitCode = await runReconcileCli({
      argv: ['--apply'],
      docs: productionOceansOfFunDocs(),
      deleteDoc,
      io,
    });

    expect(exitCode).toBe(1);
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(io.stderr.join('\n')).toMatch(/requires an explicit `--yes`/);
  });

  it('deletes every planned document and reports counts on success', async () => {
    const io = captureIo();
    const deleteDoc = vi.fn().mockResolvedValue(undefined);

    const exitCode = await runReconcileCli({
      argv: ['--apply', '--yes', '--json'],
      docs: multiRetireDocs(),
      deleteDoc,
      io,
    });

    expect(exitCode).toBe(0);
    expect(deleteDoc).toHaveBeenCalledTimes(2);
    const parsed = JSON.parse(io.stdout.join('\n'));
    expect(parsed.applied).toEqual({
      attempted: 2,
      deleted: [OCEANS_OF_FUN_RETIRED_VIRTUAL_ID, 'retired-worlds-of-fun-duplicate'],
      failed: [],
    });
  });

  it('continues past a failed delete, attempts every remaining document, and exits non-zero', async () => {
    const io = captureIo();
    const deleteDoc = vi
      .fn()
      .mockRejectedValueOnce(new Error('PERMISSION_DENIED'))
      .mockResolvedValue(undefined);

    const exitCode = await runReconcileCli({
      argv: ['--apply', '--yes', '--json'],
      docs: multiRetireDocs(),
      deleteDoc,
      io,
    });

    // One failure must not abort the rest of the plan...
    expect(deleteDoc).toHaveBeenCalledTimes(2);
    // ...must not be reported as success...
    expect(exitCode).toBe(1);
    // ...and must be surfaced explicitly with counts.
    const parsed = JSON.parse(io.stdout.join('\n'));
    expect(parsed.applied.attempted).toBe(2);
    expect(parsed.applied.deleted).toEqual(['retired-worlds-of-fun-duplicate']);
    expect(parsed.applied.failed).toEqual([
      { docId: OCEANS_OF_FUN_RETIRED_VIRTUAL_ID, error: 'PERMISSION_DENIED' },
    ]);
    expect(io.stderr.join('\n')).toMatch(/Deleted 1 of 2 planned document\(s\); 1 failed/);
  });

  it('is a no-op with a zero exit code when the collection is already reconciled', async () => {
    const io = captureIo();
    const deleteDoc = vi.fn().mockResolvedValue(undefined);
    const reconciled = productionOceansOfFunDocs().filter(
      (doc) => doc.docId !== OCEANS_OF_FUN_RETIRED_VIRTUAL_ID
    );

    const exitCode = await runReconcileCli({
      argv: ['--apply', '--yes'],
      docs: reconciled,
      deleteDoc,
      io,
    });

    expect(exitCode).toBe(0);
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(io.stderr.join('\n')).toMatch(/already reconciled/);
  });

  it('surfaces per-document failures through applyRetirePlan directly', async () => {
    const io = captureIo();
    const plan = planParkReconciliation(multiRetireDocs());
    const deleteDoc = vi.fn().mockRejectedValue(new Error('UNAVAILABLE'));

    const result = await applyRetirePlan(plan, deleteDoc, io);

    expect(result.attempted).toBe(2);
    expect(result.deleted).toEqual([]);
    expect(result.failed.map((f) => f.error)).toEqual(['UNAVAILABLE', 'UNAVAILABLE']);
    expect(deleteDoc).toHaveBeenCalledTimes(2);
  });
});
