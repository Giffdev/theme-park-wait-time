import { adminDb } from '../src/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

const API_BASE = 'https://api.themeparks.wiki/v1';

// Virtual park ID for Oceans of Fun (water park) — split from the single API entity
const OCEANS_OF_FUN_VIRTUAL_ID = '951987f7-3387-4221-8368-2859469aebcd';

// Attraction IDs that belong to Oceans of Fun (water park)
const OCEANS_OF_FUN_ATTRACTION_IDS = new Set([
  '85cd8db0-ef0e-403c-94e6-9f218c0b7f3a', // Splash Island
  '8b1be132-d160-4981-a41d-4797af390c14', // Riptide Raceway
  '6b5834eb-3fcf-4817-b3fc-17e5864f8874', // Fury of the Nile
  'cf91110a-57de-43ca-9176-2e560739cbe8', // Surf City Wave Pool
  'e05f03b6-7d09-4930-9b14-ce67fafc6d13', // Hurricane Falls
  'c76d33b5-7ecb-49a5-99cd-aaa7a9bf6b6d', // Coconut Cove
  'ae03a408-78b4-4e35-abf2-e01929507492', // Captain Kidd's
  'c7d86310-a1a6-49e2-8ba5-bb44c9ab8bc2', // Predators' Plunge
  'c7536536-ed7a-424b-9f3b-093d3d64938d', // Sharks' Revenge
  '646c76fb-aa26-42b3-ae39-c1c5e706a7fd', // Crocodile Isle
  '522b6d56-c58b-41ef-8dd6-766db8b3604b', // Aruba Tuba
  '519fbe03-2fe9-423e-9f42-8f6fb4fe9031', // Caribbean Cooler
  'd99c0844-bb06-43e5-8614-b6b01ed3a0e2', // Typhoon
  '0c9a28f4-0396-4b12-b467-29e02e114a23', // Paradise Falls
  'c8185f45-5863-46a5-8d5b-538518e619b4', // Castaway Cove
  'aea9e23a-dd82-4867-aaf8-c22478696af8', // Viking Voyager
]);

// Destinations to seed, matched by keyword in destination name
interface DestinationConfig {
  keywords: string[];
  // If specified, only seed parks matching these UUIDs (skip others like water parks not in API)
  parkFilter?: string[];
  // Override timezone for parks in this destination
  timezoneOverride?: string;
  // Virtual split: split a single API park into two virtual parks by attraction IDs
  virtualSplit?: {
    sourceId: string;
    virtualParkId: string;
    virtualParkName: string;
    attractionIds: Set<string>;
  };
}

const SEED_DESTINATIONS: Record<string, DestinationConfig> = {
  orlando: {
    keywords: ['walt disney world', 'universal orlando', 'seaworld orlando', 'seaworld parks'],
  },
  'worlds-of-fun': {
    keywords: ['worlds of fun'],
    parkFilter: ['bb731eae-7bd3-4713-bd7b-89d79b031743'],
    timezoneOverride: 'America/Chicago',
    virtualSplit: {
      sourceId: 'bb731eae-7bd3-4713-bd7b-89d79b031743',
      virtualParkId: OCEANS_OF_FUN_VIRTUAL_ID,
      virtualParkName: 'Oceans of Fun',
      attractionIds: OCEANS_OF_FUN_ATTRACTION_IDS,
    },
  },
};

interface Destination {
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

  const matched: MatchedDestination[] = [];

  for (const [name, config] of Object.entries(SEED_DESTINATIONS)) {
    const found = data.destinations.filter((dest) =>
      config.keywords.some((keyword) => dest.name.toLowerCase().includes(keyword))
    );

    if (found.length === 0) {
      console.warn(`  ⚠ No destinations matched for "${name}" — skipping`);
      continue;
    }

    for (const dest of found) {
      matched.push({ destination: dest, config });
    }
  }

  console.log(`\nMatched ${matched.length} destinations:`);
  matched.forEach((m) =>
    console.log(`  - ${m.destination.name} (${m.destination.parks.length} parks)`)
  );

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
      const parkDoc = {
        id: park.id,
        name: parkName,
        slug: park.slug || slugify(park.name),
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

main();
