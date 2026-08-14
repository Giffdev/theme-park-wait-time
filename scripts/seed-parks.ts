import { fileURLToPath } from 'url';
import path from 'path';
import {
  DESTINATION_FAMILIES,
  getParkById,
  type DestinationEntry,
} from '../src/lib/parks/park-registry';
import {
  formatSafeCatalogDiagnostic,
  runLiveCatalogReconcile,
} from './reconcile-park-catalog';

/**
 * Backward-compatible canonical catalog entrypoint.
 *
 * This command is read-only by default and now uses the same complete
 * manifest/preflight path as `reconcile-park-catalog.ts`. Writes require
 * `--apply-upserts --yes --manifest-id <id> --phase <phase-id>
 * --phase-digest <digest>`. Automatic deletion is disabled.
 */

/**
 * Every canonical registry destination is seeded. Deriving this list instead
 * of maintaining a second hand-written allowlist prevents supported parks
 * from silently lacking Firestore documents.
 */
export const SEED_DESTINATION_IDS: string[] = DESTINATION_FAMILIES.flatMap((family) =>
  family.destinations.map((destination) => destination.id)
);

/** All destination ids known to park-registry.ts, used to validate SEED_DESTINATION_IDS. */
export function getRegistryDestinationIds(): Set<string> {
  return new Set(DESTINATION_FAMILIES.flatMap((family) => family.destinations.map((d) => d.id)));
}

export interface Destination {
  id: string;
  name: string;
  slug: string;
  parks: Array<{
    id: string;
    name: string;
    slug?: string;
  }>;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Resolve the slug to persist for a seeded park document.
 *
 * `park-registry.ts` is the app's canonical source of truth for a park's
 * slug — it's what routing and detail-page Firestore lookups
 * (`where('slug', '==', ...)`) resolve against. The upstream ThemeParks Wiki
 * API also reports its own, independently-chosen `slug` field per park,
 * which is NOT guaranteed to match the registry (e.g. Islands of Adventure:
 * upstream reports "universal-islands-of-adventure" while the registry uses
 * "islands-of-adventure"). Preferring the registry slug by UUID keeps this a
 * reusable, generic mapping rather than a one-off remap, and falls back to
 * the upstream/derived slug only for parks not yet present in the registry.
 */
export function resolveParkSlug(
  park: { id: string; slug?: string; name: string },
  lookupRegistrySlug: (id: string) => string | undefined = (id) => getParkById(id)?.slug
): string {
  return lookupRegistrySlug(park.id) || park.slug || slugify(park.name);
}

interface MatchedDestination {
  destination: Destination;
  registryDestination: DestinationEntry;
  familyId: string;
  familyName: string;
}

/**
 * Pure id-based matcher between `SEED_DESTINATION_IDS` and the destinations
 * returned by the ThemeParks Wiki API. Exported (and free of network/Firestore
 * side effects) so it can be exercised directly in tests with fixture data.
 *
 * Throws before any writes if a configured destination or canonical park is
 * absent/misassigned upstream. A catalog mismatch must not produce a partial
 * seed that leaves routing, family grouping, and attraction ownership split
 * across two identities.
 */
export function resolveSeedDestinations(
  apiDestinations: Destination[],
  seedDestinationIds: string[] = SEED_DESTINATION_IDS
): MatchedDestination[] {
  const registryDestinations = DESTINATION_FAMILIES.flatMap((family) =>
    family.destinations.map((destination) => ({
      destination,
      familyId: family.familyId,
      familyName: family.familyName,
    }))
  );
  const registryById = new Map(
    registryDestinations.map((entry) => [entry.destination.id, entry])
  );
  const apiById = new Map(apiDestinations.map((dest) => [dest.id, dest]));
  const matched: MatchedDestination[] = [];

  for (const destinationId of seedDestinationIds) {
    const registryEntry = registryById.get(destinationId);
    if (!registryEntry) {
      throw new Error(
        `SEED_DESTINATION_IDS contains "${destinationId}", which is not a destination in ` +
          `park-registry.ts. Fix the seed list or add the destination to the registry first.`
      );
    }

    const dest = apiById.get(destinationId);
    if (!dest) {
      throw new Error(
        `Canonical destination "${registryEntry.destination.name}" (${destinationId}) is missing ` +
          'from ThemeParks Wiki. Seed aborted before any writes.'
      );
    }

    const upstreamParkIds = new Set(dest.parks.map((park) => park.id));
    const missingParks = registryEntry.destination.parks.filter(
      (park) => !upstreamParkIds.has(park.id)
    );
    if (missingParks.length > 0) {
      throw new Error(
        `Canonical destination "${registryEntry.destination.name}" is missing upstream park(s): ` +
          missingParks.map((park) => `${park.name} (${park.id})`).join(', ') +
          '. Seed aborted before any writes.'
      );
    }

    matched.push({
      destination: dest,
      registryDestination: registryEntry.destination,
      familyId: registryEntry.familyId,
      familyName: registryEntry.familyName,
    });
  }

  return matched;
}

export async function syncCanonicalParkCatalog(
  argv: string[] = process.argv.slice(2)
): Promise<number> {
  return runLiveCatalogReconcile(argv);
}

export interface LegacyCatalogEntrypointIo {
  err(line: string): void;
}

export async function runSeedParksEntrypoint(
  argv: string[] = process.argv.slice(2),
  options: {
    run?: (argv: string[]) => Promise<number>;
    io?: LegacyCatalogEntrypointIo;
  } = {}
): Promise<number> {
  const io = options.io ?? { err: (line: string) => console.error(line) };
  try {
    const exitCode = await (options.run ?? syncCanonicalParkCatalog)(argv);
    if (exitCode !== 0) {
      io.err(`Park catalog seed exited with code ${exitCode}; no success was reported.`);
    }
    return exitCode;
  } catch (error) {
    io.err(`Park catalog seed failed: ${formatSafeCatalogDiagnostic(error)}`);
    return 1;
  }
}

// Only run when executed directly (`npx tsx scripts/seed-parks.ts`), not when
// imported by tests — importing this module still triggers the Firebase Admin
// module-level init in `../src/lib/firebase/admin`, so tests mock that module.
const isDirectlyExecuted =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectlyExecuted) {
  runSeedParksEntrypoint().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
