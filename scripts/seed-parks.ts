import { adminDb } from '../src/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

const API_BASE = 'https://api.themeparks.wiki/v1';

// Orlando destination keywords to match
const ORLANDO_DESTINATIONS = [
  'walt disney world',
  'universal orlando',
  'seaworld orlando',
  'seaworld parks',
];

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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function getOrlandoDestinations(): Promise<Destination[]> {
  console.log('Fetching destinations from ThemeParks.wiki...');
  const data = await fetchJson<{ destinations: Destination[] }>(`${API_BASE}/destinations`);

  const orlandoDestinations = data.destinations.filter((dest) =>
    ORLANDO_DESTINATIONS.some((keyword) => dest.name.toLowerCase().includes(keyword))
  );

  console.log(`Found ${orlandoDestinations.length} Orlando destinations:`);
  orlandoDestinations.forEach((d) => console.log(`  - ${d.name} (${d.parks.length} parks)`));

  return orlandoDestinations;
}

async function seedParksAndAttractions(destinations: Destination[]): Promise<void> {
  let parkCount = 0;
  let attractionCount = 0;

  for (const dest of destinations) {
    for (const park of dest.parks) {
      console.log(`\nProcessing park: ${park.name}...`);

      // Fetch park entity details for timezone/location
      let timezone: string | null = null;
      let location: { lat: number; lng: number } | null = null;
      try {
        const entityData = await fetchJson<{
          timezone?: string;
          location?: { latitude: number; longitude: number };
        }>(`${API_BASE}/entity/${park.id}`);
        timezone = entityData.timezone || null;
        if (entityData.location) {
          location = { lat: entityData.location.latitude, lng: entityData.location.longitude };
        }
      } catch (e) {
        console.warn(`  Warning: Could not fetch entity details for ${park.name}`);
      }

      // Write park document
      const parkDoc = {
        id: park.id,
        name: park.name,
        slug: park.slug || slugify(park.name),
        destinationName: dest.name,
        destinationId: dest.id,
        timezone: timezone || 'America/New_York',
        location,
        updatedAt: Timestamp.now(),
      };

      await adminDb.collection('parks').doc(park.id).set(parkDoc, { merge: true });
      parkCount++;
      console.log(`  ✓ Park saved: ${park.name}`);

      // Fetch children (attractions)
      let children: EntityChild[] = [];
      try {
        const childData = await fetchJson<{ children: EntityChild[] }>(
          `${API_BASE}/entity/${park.id}/children`
        );
        children = childData.children || [];
      } catch (e) {
        console.warn(`  Warning: Could not fetch children for ${park.name}`);
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
  console.log(`  Parks: ${parkCount}`);
  console.log(`  Attractions: ${attractionCount}`);
  console.log(`========================================`);
}

async function main(): Promise<void> {
  try {
    const destinations = await getOrlandoDestinations();

    if (destinations.length === 0) {
      console.error('No Orlando destinations found. Check API response.');
      process.exit(1);
    }

    await seedParksAndAttractions(destinations);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

main();
