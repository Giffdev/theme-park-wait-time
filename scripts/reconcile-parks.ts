/**
 * Firestore `parks` collection reconciliation.
 *
 * Root cause this exists for (production evidence): the `parks` collection
 * contains BOTH a retired, locally-fabricated "virtual" Oceans of Fun doc
 * (`951987f7-3387-4221-8368-2859469aebcd`, created back when ThemeParks Wiki
 * exposed Oceans of Fun only as attractions nested under Worlds of Fun) and
 * the real upstream entity that `park-registry.ts` now points at
 * (`b5a89552-3381-47ad-88cc-ab0087019c8b`). Both carry `slug:
 * "oceans-of-fun"`, and the park-detail page resolves parks with an
 * *unordered* `where('slug', '==', ...)` query — so which of the two
 * duplicates wins is decided by Firestore, not by us, and in practice the
 * retired id is the one selected.
 *
 * `scripts/seed-parks.ts` cannot fix this on its own: it writes with
 * `{ merge: true }` and therefore only ever creates or updates documents. A
 * document that no longer corresponds to any registry park is invisible to
 * it and survives every reseed.
 *
 * Safety model (deliberately conservative — this operates on production
 * data):
 *   • Dry-run by default. Deleting requires BOTH `--apply` and `--yes`.
 *   • Only documents that are (a) unknown to `park-registry.ts`, (b) inside a
 *     destination we actively seed, and (c) shadowing the slug of a
 *     registry park that already has its own document are ever proposed for
 *     deletion. Anything else is reported for human review and never
 *     touched, so an intentionally-added extra park cannot be deleted.
 *   • Idempotent: running it again after a successful apply produces an
 *     empty retire plan.
 *   • Park documents only. Deletes are shallow and nothing else keyed by the
 *     retired park id is touched; the residual data is *reported* (see
 *     `ORPHANED_PARK_DATA_PATHS`) rather than recursively deleted.
 *
 * Output contract: stdout carries the report only (in `--json` mode, exactly
 * one parseable JSON document). Every notice, progress line and error goes to
 * stderr, so `... --json | jq` is always safe.
 *
 * Usage:
 *   npx tsx scripts/reconcile-parks.ts             # dry run (read-only)
 *   npx tsx scripts/reconcile-parks.ts --json      # dry run, machine-readable
 *   npx tsx scripts/reconcile-parks.ts --apply --yes   # deletes retire-plan docs
 *
 * Exit codes: 0 on success (including a clean dry run), 1 if `--apply` was
 * requested without `--yes`, or if any planned delete failed.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import { adminDb } from '../src/lib/firebase/admin';
import { DESTINATION_FAMILIES, getParkById } from '../src/lib/parks/park-registry';
import { SEED_DESTINATION_IDS } from './seed-parks';

/** A `parks` document reduced to just the fields reconciliation reasons about. */
export interface ParkDocRecord {
  docId: string;
  id?: string;
  slug?: string;
  name?: string;
  destinationId?: string;
  isVirtual?: boolean;
  sourceApiParkId?: string;
}

export type ReconcileAction = 'retire' | 'review' | 'keep';

export interface ReconcileFinding {
  docId: string;
  slug?: string;
  name?: string;
  destinationId?: string;
  action: ReconcileAction;
  reason: string;
}

export interface SlugConflict {
  slug: string;
  docIds: string[];
  /** The doc that park-registry.ts considers canonical for this slug, if any. */
  canonicalDocId?: string;
}

export interface MissingCanonicalSlug {
  parkId: string;
  slug: string;
  name: string;
}

export interface ReconcilePlan {
  /** Safe to delete: registry-retired duplicates shadowing a canonical park. */
  retire: ReconcileFinding[];
  /** Needs a human decision; never deleted by this tool. */
  review: ReconcileFinding[];
  /** Documents that match the registry exactly. */
  keep: ReconcileFinding[];
  /** Any slug served by more than one document. */
  slugConflicts: SlugConflict[];
  /** Seeded registry parks with no document carrying their canonical slug. */
  missingCanonicalSlugs: MissingCanonicalSlug[];
}

export interface ReconcileOptions {
  seedDestinationIds?: string[];
  lookupParkById?: (id: string) => { id: string; slug: string; name: string } | undefined;
  registryParks?: Array<{ id: string; slug: string; name: string; destinationId: string }>;
}

function defaultRegistryParks() {
  return DESTINATION_FAMILIES.flatMap((family) =>
    family.destinations.flatMap((dest) =>
      dest.parks.map((park) => ({
        id: park.id,
        slug: park.slug,
        name: park.name,
        destinationId: dest.id,
      }))
    )
  );
}

function effectiveId(doc: ParkDocRecord): string {
  return doc.id || doc.docId;
}

/**
 * Pure planner: classifies every `parks` document without any Firestore or
 * network access, so the exact production scenario can be pinned in tests.
 */
export function planParkReconciliation(
  docs: ParkDocRecord[],
  options: ReconcileOptions = {}
): ReconcilePlan {
  const seedDestinationIds = new Set(options.seedDestinationIds ?? SEED_DESTINATION_IDS);
  const lookupParkById = options.lookupParkById ?? ((id: string) => getParkById(id));
  const registryParks = options.registryParks ?? defaultRegistryParks();

  // Slugs that a registry park already owns *and* has its own matching
  // document for. Only these make a duplicate safely removable: deleting a
  // shadowing doc can never remove the last document serving that slug.
  const canonicalDocIdBySlug = new Map<string, string>();
  for (const doc of docs) {
    const registryPark = lookupParkById(effectiveId(doc));
    if (registryPark && doc.slug === registryPark.slug) {
      canonicalDocIdBySlug.set(registryPark.slug, doc.docId);
    }
  }

  const retire: ReconcileFinding[] = [];
  const review: ReconcileFinding[] = [];
  const keep: ReconcileFinding[] = [];

  for (const doc of docs) {
    const base = {
      docId: doc.docId,
      slug: doc.slug,
      name: doc.name,
      destinationId: doc.destinationId,
    };
    const registryPark = lookupParkById(effectiveId(doc));

    if (registryPark) {
      if (doc.slug === registryPark.slug) {
        keep.push({ ...base, action: 'keep', reason: 'Matches park-registry.ts id and slug.' });
      } else {
        review.push({
          ...base,
          action: 'review',
          reason:
            `Slug drift: registry expects "${registryPark.slug}" but the document has ` +
            `"${doc.slug ?? '(none)'}". Fix by reseeding (scripts/seed-parks.ts), never by deleting.`,
        });
      }
      continue;
    }

    if (!doc.destinationId || !seedDestinationIds.has(doc.destinationId)) {
      review.push({
        ...base,
        action: 'review',
        reason:
          'Unknown to park-registry.ts and outside the seeded destinations — treated as an ' +
          'intentional extra park and left untouched.',
      });
      continue;
    }

    const canonicalDocId = doc.slug ? canonicalDocIdBySlug.get(doc.slug) : undefined;
    if (canonicalDocId && canonicalDocId !== doc.docId) {
      retire.push({
        ...base,
        action: 'retire',
        reason:
          `Registry-retired duplicate: shadows slug "${doc.slug}", which canonical document ` +
          `${canonicalDocId} already serves.`,
      });
      continue;
    }

    review.push({
      ...base,
      action: 'review',
      reason:
        'Unknown to park-registry.ts but the only document serving its slug — deleting it would ' +
        'remove the slug entirely. Reseed or update the registry first.',
    });
  }

  const docIdsBySlug = new Map<string, string[]>();
  for (const doc of docs) {
    if (!doc.slug) continue;
    docIdsBySlug.set(doc.slug, [...(docIdsBySlug.get(doc.slug) ?? []), doc.docId]);
  }
  const slugConflicts: SlugConflict[] = [...docIdsBySlug.entries()]
    .filter(([, docIds]) => docIds.length > 1)
    .map(([slug, docIds]) => ({ slug, docIds, canonicalDocId: canonicalDocIdBySlug.get(slug) }));

  const presentSlugs = new Set(docs.map((doc) => doc.slug).filter(Boolean) as string[]);
  const missingCanonicalSlugs: MissingCanonicalSlug[] = registryParks
    .filter((park) => seedDestinationIds.has(park.destinationId))
    .filter((park) => !presentSlugs.has(park.slug))
    .map((park) => ({ parkId: park.id, slug: park.slug, name: park.name }));

  return { retire, review, keep, slugConflicts, missingCanonicalSlugs };
}

/**
 * Park-id-keyed data that a `parks/{id}` document delete does NOT remove.
 *
 * Firestore deletes are shallow: removing a document leaves its
 * subcollections in place, and nothing keyed by the same park id in other
 * collections is touched either. Operators need to know that retiring a
 * duplicate park document narrows the slug query and nothing else — the
 * retired id's residual data stays exactly where it is.
 *
 * Deliberately reported, not deleted: broadening this tool into recursive
 * cleanup would make a targeted, reviewable fix into an unbounded
 * destructive operation.
 */
export const ORPHANED_PARK_DATA_PATHS: readonly string[] = [
  'parks/{parkId}/operatingHours/*  (subcollection — survives the parent delete)',
  'parks/{parkId}/seasonalSchedules/*  (subcollection — survives the parent delete)',
  'parks/{parkId}/attractions/*  (subcollection — survives the parent delete)',
  'parks/{parkId}/currentWaitTimes/*  (subcollection — survives the parent delete)',
  'attractions/* where parkId == {parkId}',
  'waitTimes/{parkId} and waitTimes/{parkId}/current/*',
  'waitTimeHistory/{parkId}/daily/*',
  'forecastAggregates/{parkId}/byDayOfWeek/*',
  'parkSchedules/{parkId}/daily/*',
  'crowdsourcedWaitTimes/{parkId}/reports/* and /aggregates/*',
];

function orphanNoticeLines(): string[] {
  return [
    '',
    '-- deletion scope (park documents only) --',
    '  A `parks/{id}` delete is shallow. The following park-id-keyed data is NOT',
    '  removed and is left intentionally untouched for separate, explicit review:',
    ...ORPHANED_PARK_DATA_PATHS.map((path) => `    • ${path}`),
    '  Retiring the duplicate only removes it from unordered `where("slug", "==", ...)`',
    '  resolution; the retired id keeps whatever data it already had.',
  ];
}

export function formatPlan(plan: ReconcilePlan): string {
  const lines: string[] = [];
  lines.push('=== Firestore `parks` reconciliation ===');
  lines.push(`  matching registry:      ${plan.keep.length}`);
  lines.push(`  retire candidates:      ${plan.retire.length}`);
  lines.push(`  needs human review:     ${plan.review.length}`);
  lines.push(`  duplicate slugs:        ${plan.slugConflicts.length}`);
  lines.push(`  missing canonical slugs:${plan.missingCanonicalSlugs.length}`);

  if (plan.slugConflicts.length > 0) {
    lines.push('\n-- duplicate slugs (unordered slug queries pick non-deterministically) --');
    for (const conflict of plan.slugConflicts) {
      lines.push(
        `  ${conflict.slug}: ${conflict.docIds.join(', ')} ` +
          `(canonical: ${conflict.canonicalDocId ?? 'none'})`
      );
    }
  }

  if (plan.retire.length > 0) {
    lines.push('\n-- retire candidates (deleted only with --apply --yes) --');
    for (const finding of plan.retire) {
      lines.push(`  ${finding.docId} [${finding.slug ?? 'no-slug'}] ${finding.name ?? ''}`);
      lines.push(`      ${finding.reason}`);
    }
    lines.push(...orphanNoticeLines());
  }

  if (plan.review.length > 0) {
    lines.push('\n-- needs review (never auto-deleted) --');
    lines.push('   see docs/parks-duplicate-slug-followups.md for the known open pairs');
    for (const finding of plan.review) {
      lines.push(`  ${finding.docId} [${finding.slug ?? 'no-slug'}] ${finding.name ?? ''}`);
      lines.push(`      ${finding.reason}`);
    }
  }

  if (plan.missingCanonicalSlugs.length > 0) {
    lines.push('\n-- seeded registry parks with no document for their canonical slug --');
    for (const missing of plan.missingCanonicalSlugs) {
      lines.push(`  ${missing.name} (${missing.parkId}) expects slug "${missing.slug}"`);
    }
  }

  return lines.join('\n');
}

/** Result of an `--apply --yes` run. */
export interface ApplyResult {
  attempted: number;
  deleted: string[];
  failed: Array<{ docId: string; error: string }>;
}

export interface ReconcileJsonReport extends ReconcilePlan {
  orphanedCollections: readonly string[];
  applied: ApplyResult | null;
}

export function buildJsonReport(plan: ReconcilePlan, applied: ApplyResult | null): ReconcileJsonReport {
  return { ...plan, orphanedCollections: ORPHANED_PARK_DATA_PATHS, applied };
}

/**
 * Output sink. stdout carries the machine-readable report *only*; every
 * human-facing notice, progress line and error goes to stderr, so
 * `--json` output stays parseable when piped.
 */
export interface ReconcileIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

const consoleIo: ReconcileIo = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

/**
 * Deletes the retire plan one document at a time.
 *
 * Per-document error isolation is the point: a single failed delete
 * (permissions, contention, a doc removed by someone else mid-run) must not
 * abandon the remaining planned deletes, and must not be reported as
 * success. Failures are collected and surfaced with explicit counts; the
 * caller turns any failure into a non-zero exit. Re-running is safe — a
 * document deleted by a previous run is simply no longer in the plan.
 */
export async function applyRetirePlan(
  plan: ReconcilePlan,
  deleteDoc: (docId: string) => Promise<void>,
  io: ReconcileIo = consoleIo
): Promise<ApplyResult> {
  const result: ApplyResult = { attempted: plan.retire.length, deleted: [], failed: [] };

  for (const finding of plan.retire) {
    try {
      await deleteDoc(finding.docId);
      result.deleted.push(finding.docId);
      io.err(`  ✓ deleted ${finding.docId} [${finding.slug ?? 'no-slug'}]`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({ docId: finding.docId, error: message });
      io.err(`  ✗ FAILED to delete ${finding.docId} [${finding.slug ?? 'no-slug'}]: ${message}`);
    }
  }

  io.err(
    `\nDeleted ${result.deleted.length} of ${result.attempted} planned document(s); ` +
      `${result.failed.length} failed.`
  );
  if (result.failed.length > 0) {
    io.err('Re-run the tool to retry the failures — the plan is recomputed from live data.');
  }
  return result;
}

export interface RunReconcileOptions {
  argv: string[];
  docs: ParkDocRecord[];
  deleteDoc?: (docId: string) => Promise<void>;
  io?: ReconcileIo;
}

/**
 * CLI body, decoupled from Firestore so its exit-code and output contracts
 * are directly testable. Returns the process exit code.
 */
export async function runReconcileCli(options: RunReconcileOptions): Promise<number> {
  const io = options.io ?? consoleIo;
  const args = new Set(options.argv);
  const apply = args.has('--apply');
  const confirmed = args.has('--yes');
  const asJson = args.has('--json');

  const plan = planParkReconciliation(options.docs);
  let applied: ApplyResult | null = null;
  let exitCode = 0;

  // Text mode prints the plan up front; JSON mode emits exactly one document
  // at the end so stdout is always a single parseable value.
  if (!asJson) io.out(formatPlan(plan));

  if (!apply) {
    io.err(
      '\nDry run only — no documents were modified. ' +
        'Re-run with `--apply --yes` to delete the retire candidates above.'
    );
  } else if (!confirmed) {
    io.err('\nRefusing to delete: `--apply` requires an explicit `--yes` confirmation.');
    exitCode = 1;
  } else if (plan.retire.length === 0) {
    io.err('\nNothing to delete — the collection is already reconciled.');
  } else if (!options.deleteDoc) {
    io.err('\nRefusing to delete: no delete implementation was provided.');
    exitCode = 1;
  } else {
    io.err('\nApplying retire plan — park documents only; deletes are shallow.');
    for (const line of orphanNoticeLines()) io.err(line);
    applied = await applyRetirePlan(plan, options.deleteDoc, io);
    if (applied.failed.length > 0) exitCode = 1;
  }

  if (asJson) io.out(JSON.stringify(buildJsonReport(plan, applied), null, 2));

  return exitCode;
}

export async function readParkDocs(): Promise<ParkDocRecord[]> {
  const snapshot = await adminDb.collection('parks').get();
  return snapshot.docs.map((doc) => {
    const data = doc.data() as Omit<ParkDocRecord, 'docId'>;
    return {
      docId: doc.id,
      id: data.id,
      slug: data.slug,
      name: data.name,
      destinationId: data.destinationId,
      isVirtual: data.isVirtual,
      sourceApiParkId: data.sourceApiParkId,
    };
  });
}

async function main(): Promise<void> {
  process.exitCode = await runReconcileCli({
    argv: process.argv.slice(2),
    docs: await readParkDocs(),
    deleteDoc: (docId) => adminDb.collection('parks').doc(docId).delete().then(() => undefined),
  });
}

const isDirectlyExecuted =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectlyExecuted) {
  main().catch((error) => {
    console.error('Reconciliation failed:', error);
    process.exit(1);
  });
}
