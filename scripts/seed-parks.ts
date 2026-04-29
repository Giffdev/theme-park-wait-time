import { adminDb } from '../src/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

const API_BASE = 'https://api.themeparks.wiki/v1';

// Destinations to seed, matched by keyword in destination name
interface DestinationConfig {
  keywords: string[];
  // If specified, only seed parks matching these UUIDs (skip others like water parks not in API)
  parkFilter?: string[];
  // Override timezone for parks in this destination
  timezoneOverride?: string;
}

const SEED_DESTINATIONS: Record<string, DestinationConfig> = {
  orlando: {
    keywords: ['walt disney world', 'universal orlando', 'seaworld orlando', 'seaworld parks'],
  },
  'worlds-of-fun': {
    keywords: ['worlds of fun'],
    parkFilter: ['bb731eae-7bd3-4713-bd7b-89d79b031743'],
    timezoneOverride: 'America/Chicago',
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
      const parkDoc = {
        id: park.id,
        name: park.name,
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

      // Batch write attractions (max 500 per batch)
      const BATCH_SIZE = 499;
      for (let i = 0; i < children.length; i += BATCH_SIZE) {
        const batch = adminDb.batch();
        const chunk = children.slice(i, i + BATCH_SIZE);

        for (const child of chunk) {
          const attractionDoc = {
            id: child.id,
            name: child.name,
            parkId: park.id,
            parkName: park.name,
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
