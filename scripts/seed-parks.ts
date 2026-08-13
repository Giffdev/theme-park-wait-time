import { fileURLToPath } from 'url';
import path from 'path';
import { adminDb } from '../src/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { DESTINATION_FAMILIES, getParkById } from '../src/lib/parks/park-registry';

const API_BASE = 'https://api.themeparks.wiki/v1';

// Per-destination overrides for behavior the upstream API can't express on
// its own (virtual water-park splits, timezone gaps, filtering out API-listed
// parks we don't support yet). Keyed by the *destination* UUID exactly as it
// appears both in `park-registry.ts` and in the ThemeParks Wiki API response —
// this is the only place a destination should need special-casing.
interface DestinationConfig {
  // If specified, only seed parks matching these UUIDs (skip others like water parks not in API)
  parkFilter?: string[];
  // Override timezone for parks in this destination
  timezoneOverride?: string;
  // Virtual split: split a single API park into two virtual parks by attraction IDs.
  // Kept as a general-purpose escape hatch for a destination whose upstream API
  // entity doesn't yet separate two on-the-ground parks; NOT currently used by
  // any configured destination (see history for the retired Worlds of Fun/Oceans
  // of Fun override — ThemeParks Wiki now reports Oceans of Fun as its own
  // real entity, so the fabrication is obsolete and would fight the real ids).
  virtualSplit?: {
    sourceId: string;
    virtualParkId: string;
    virtualParkName: string;
    attractionIds: Set<string>;
  };
}

const DESTINATION_CONFIG_OVERRIDES: Record<string, DestinationConfig> = {
  // Worlds of Fun (Cedar Fair) — Oceans of Fun used to be fabricated locally
  // as a virtual park split from Worlds of Fun's attraction list, because the
  // upstream API previously exposed only a single combined entity. ThemeParks
  // Wiki now lists Oceans of Fun as its own distinct entity
  // (b5a89552-3381-47ad-88cc-ab0087019c8b, matching the corrected
  // park-registry.ts id) with its own attractions/schedule/timezone, so both
  // parks are seeded normally — no virtual split needed.
  'c4231018-dc6f-4d8d-bfc2-7a21a6c9e9fa': {
    parkFilter: ['bb731eae-7bd3-4713-bd7b-89d79b031743', 'b5a89552-3381-47ad-88cc-ab0087019c8b'],
    timezoneOverride: 'America/Chicago',
  },
};

/**
 * Destination UUIDs actively seeded into Firestore. This is the single
 * reusable mapping path between `park-registry.ts` (the app's supported-park
 * source of truth) and this script (the Firestore data source of truth) —
 * to onboard a new destination that already exists in `park-registry.ts`,
 * add its destination id here. `getRegistryDestinationIds()` / the parity
 * test in `tests/scripts/seed-parks-parity.test.ts` guard against typos and
 * against a registry destination silently having no seed coverage.
 *
 * Previously this script matched destinations via fuzzy keyword search
 * against the upstream API's destination *names* (e.g. "worlds of fun").
 * That silently skipped any registry destination whose name didn't match a
 * configured keyword — which is exactly how Alton Towers ended up present in
 * `park-registry.ts` (and thus linkable in the UI) but absent from Firestore,
 * producing "Park details unavailable". Direct id lookups can't drift like
 * that: an id either matches a registry destination and an API destination,
 * or the mismatch is caught explicitly below.
 */
export const SEED_DESTINATION_IDS: string[] = [
  'e957da41-3552-4cf6-b636-5babc5cbc4e5', // Walt Disney World
  '89db5d43-c434-4097-b71f-f6869f495a22', // Universal Orlando Resort
  '643e837e-b244-4663-8d3a-148c26ecba9c', // SeaWorld Orlando
  'c4231018-dc6f-4d8d-bfc2-7a21a6c9e9fa', // Worlds of Fun
  '8e6bf2ae-77ac-403d-8e10-d7cd9b6c05d7', // Alton Towers
];

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

interface EntityChild {
  id: string;
  name: string;
  entityType: string;
  slug?: string;
}

// Parks whose API name should be overridden in our system
const PARK_NAME_OVERRIDES: Record<string, string> = {
  'bb731eae-7bd3-4713-bd7b-89d79b031743': 'Worlds of Fun',
};

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

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      return null;
    }
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

interface MatchedDestination {
  destination: Destination;
  config: DestinationConfig;
}

async function getConfiguredDestinations(): Promise<MatchedDestination[]> {
  console.log('Fetching destinations from ThemeParks.wiki...');
  const data = await fetchJson<{ destinations: Destination[] }>(`${API_BASE}/destinations`);
  if (!data) {
    throw new Error('Could not fetch destinations list from API');
  }

  const matched = resolveSeedDestinations(data.destinations);

  console.log(`\nMatched ${matched.length} destinations:`);
  matched.forEach((m) =>
    console.log(`  - ${m.destination.name} (${m.destination.parks.length} parks)`)
  );

  return matched;
}

/**
 * Pure id-based matcher between `SEED_DESTINATION_IDS` and the destinations
 * returned by the ThemeParks Wiki API. Exported (and free of network/Firestore
 * side effects) so it can be exercised directly in tests with fixture data.
 *
 * Throws if a configured seed id isn't a real `park-registry.ts` destination
 * (a typo in `SEED_DESTINATION_IDS`) rather than silently skipping it — this
 * is the parity guarantee that replaces the old fuzzy keyword matching.
 */
export function resolveSeedDestinations(
  apiDestinations: Destination[],
  seedDestinationIds: string[] = SEED_DESTINATION_IDS
): MatchedDestination[] {
  const registryIds = getRegistryDestinationIds();
  const apiById = new Map(apiDestinations.map((dest) => [dest.id, dest]));
  const matched: MatchedDestination[] = [];

  for (const destinationId of seedDestinationIds) {
    if (!registryIds.has(destinationId)) {
      throw new Error(
        `SEED_DESTINATION_IDS contains "${destinationId}", which is not a destination in ` +
          `park-registry.ts. Fix the seed list or add the destination to the registry first.`
      );
    }

    const dest = apiById.get(destinationId);
    if (!dest) {
      console.warn(`  ⚠ Destination ${destinationId} not found in ThemeParks Wiki API — skipping`);
      continue;
    }

    matched.push({ destination: dest, config: DESTINATION_CONFIG_OVERRIDES[destinationId] ?? {} });
  }

  return matched;
}

async function seedParksAndAttractions(matches: MatchedDestination[]): Promise<void> {
  let parkCount = 0;
  let attractionCount = 0;
  let skippedCount = 0;

  for (const { destination: dest, config } of matches) {
    for (const park of dest.parks) {
      // If a park filter is set, skip parks not in the filter
      if (config.parkFilter && !config.parkFilter.includes(park.id)) {
        console.log(`\n  Skipping ${park.name} (not in park filter)`);
        skippedCount++;
        continue;
      }

      console.log(`\nProcessing park: ${park.name}...`);

      // Fetch park entity details for timezone/location
      let timezone: string | null = null;
      let location: { lat: number; lng: number } | null = null;
      try {
        const entityData = await fetchJson<{
          timezone?: string;
          location?: { latitude: number; longitude: number };
        }>(`${API_BASE}/entity/${park.id}`);

        if (!entityData) {
          console.warn(`  ⚠ Park ${park.name} (${park.id}) not found in API — skipping`);
          skippedCount++;
          continue;
        }

        timezone = entityData.timezone || null;
        if (entityData.location) {
          location = { lat: entityData.location.latitude, lng: entityData.location.longitude };
        }
      } catch (e) {
        console.warn(`  ⚠ Could not fetch entity details for ${park.name} — skipping`);
        skippedCount++;
        continue;
      }

      // Apply timezone override if configured
      const finalTimezone = config.timezoneOverride || timezone || 'America/New_York';

      // Write park document
      const parkName = PARK_NAME_OVERRIDES[park.id] || park.name;
      // Slug identity: see resolveParkSlug() — root cause was Islands of
      // Adventure being seeded with the upstream API's own slug
      // ("universal-islands-of-adventure") instead of park-registry.ts's
      // canonical slug ("islands-of-adventure"), causing the Firestore
      // `parks` doc (which frontend navigation resolves against) to drift
      // from the registry's canonical identity.
      const parkDoc = {
        id: park.id,
        name: parkName,
        slug: resolveParkSlug(park),
        destinationName: dest.name,
        destinationId: dest.id,
        timezone: finalTimezone,
        location,
        updatedAt: Timestamp.now(),
      };

      await adminDb.collection('parks').doc(park.id).set(parkDoc, { merge: true });
      parkCount++;
      console.log(`  ✓ Park saved: ${park.name} (${finalTimezone})`);

      // Fetch children (attractions)
      let children: EntityChild[] = [];
      try {
        const childData = await fetchJson<{ children: EntityChild[] }>(
          `${API_BASE}/entity/${park.id}/children`
        );
        if (!childData) {
          console.warn(`  ⚠ No children data for ${park.name} — skipping attractions`);
          continue;
        }
        children = childData.children || [];
      } catch (e) {
        console.warn(`  ⚠ Could not fetch children for ${park.name}`);
        continue;
      }

      console.log(`  Found ${children.length} entities, writing to Firestore...`);

      // Determine which attractions belong to the virtual split park (if configured)
      const virtualSplit = config.virtualSplit?.sourceId === park.id ? config.virtualSplit : undefined;

      // Batch write attractions (max 500 per batch)
      const BATCH_SIZE = 499;
      for (let i = 0; i < children.length; i += BATCH_SIZE) {
        const batch = adminDb.batch();
        const chunk = children.slice(i, i + BATCH_SIZE);

        for (const child of chunk) {
          // Assign to virtual park if this attraction belongs to the split set
          const assignedParkId = virtualSplit?.attractionIds.has(child.id)
            ? virtualSplit.virtualParkId
            : park.id;
          const assignedParkName = virtualSplit?.attractionIds.has(child.id)
            ? virtualSplit.virtualParkName
            : parkName;

          const attractionDoc = {
            id: child.id,
            name: child.name,
            parkId: assignedParkId,
            parkName: assignedParkName,
            entityType: child.entityType || 'UNKNOWN',
            slug: child.slug || slugify(child.name),
            updatedAt: Timestamp.now(),
          };

          const ref = adminDb.collection('attractions').doc(child.id);
          batch.set(ref, attractionDoc, { merge: true });
          attractionCount++;
        }

        await batch.commit();
      }

      console.log(`  ✓ ${children.length} attractions saved`);

      // If a virtual split is configured, also create the virtual park document
      if (virtualSplit) {
        const virtualParkDoc = {
          id: virtualSplit.virtualParkId,
          name: virtualSplit.virtualParkName,
          slug: slugify(virtualSplit.virtualParkName),
          destinationName: dest.name,
          destinationId: dest.id,
          timezone: finalTimezone,
          location,
          entityType: 'PARK',
          isVirtual: true,
          sourceApiParkId: virtualSplit.sourceId,
          updatedAt: Timestamp.now(),
        };
        await adminDb.collection('parks').doc(virtualSplit.virtualParkId).set(virtualParkDoc, { merge: true });
        parkCount++;
        console.log(`  ✓ Virtual park saved: ${virtualSplit.virtualParkName}`);
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(`\n========================================`);
  console.log(`Seeding complete!`);
  console.log(`  Parks seeded: ${parkCount}`);
  console.log(`  Attractions seeded: ${attractionCount}`);
  console.log(`  Parks skipped: ${skippedCount}`);
  console.log(`========================================`);
}

async function main(): Promise<void> {
  try {
    const matches = await getConfiguredDestinations();

    if (matches.length === 0) {
      console.error('No configured destinations found. Check API response.');
      process.exit(1);
    }

    await seedParksAndAttractions(matches);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

// Only run when executed directly (`npx tsx scripts/seed-parks.ts`), not when
// imported by tests — importing this module still triggers the Firebase Admin
// module-level init in `../src/lib/firebase/admin`, so tests mock that module.
const isDirectlyExecuted =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectlyExecuted) {
  main();
}
