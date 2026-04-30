/**
 * sync-all-parks.ts
 *
 * Fetches ALL destinations and parks from the ThemeParks Wiki API,
 * then writes park + attraction documents to Firestore.
 *
 * Idempotent — uses set(..., { merge: true }) so it can be re-run safely.
 * Rate-limited — 500ms delay between park requests.
 *
 * Usage: npx tsx scripts/sync-all-parks.ts
 */

import { adminDb } from '../src/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

const API_BASE = 'https://api.themeparks.wiki/v1';
const DELAY_MS = 500;
const BATCH_SIZE = 499;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiDestination {
  id: string;
  name: string;
  slug: string;
  parks: Array<{ id: string; name: string; slug?: string }>;
}

interface ApiEntity {
  id: string;
  name: string;
  entityType: string;
  timezone?: string;
  location?: { latitude: number; longitude: number };
}

interface ApiChild {
  id: string;
  name: string;
  entityType: string;
  slug?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Parks whose API name should be overridden in our system
const PARK_NAME_OVERRIDES: Record<string, string> = {
  'bb731eae-7bd3-4713-bd7b-89d79b031743': 'Worlds of Fun & Oceans of Fun',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''®™]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 429) {
        console.warn(`  ⚠ Rate limited on ${url} — waiting 5s and retrying...`);
        await delay(5000);
        const retry = await fetch(url);
        if (!retry.ok) return null;
        return retry.json() as Promise<T>;
      }
      if (res.status === 404) return null;
      console.warn(`  ⚠ HTTP ${res.status} for ${url}`);
      return null;
    }
    return res.json() as Promise<T>;
  } catch (e) {
    console.warn(`  ⚠ Network error for ${url}: ${e}`);
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main Logic ──────────────────────────────────────────────────────────────

async function getAllDestinations(): Promise<ApiDestination[]> {
  console.log('📡 Fetching all destinations from ThemeParks Wiki API...\n');
  const data = await fetchJson<{ destinations: ApiDestination[] }>(`${API_BASE}/destinations`);
  if (!data) {
    throw new Error('Failed to fetch destinations list');
  }
  console.log(`  Found ${data.destinations.length} destinations\n`);
  return data.destinations;
}

async function syncPark(
  park: { id: string; name: string; slug?: string },
  destination: ApiDestination
): Promise<{ parkSaved: boolean; attractionCount: number }> {
  // Fetch entity details for timezone/location
  const entity = await fetchJson<ApiEntity>(`${API_BASE}/entity/${park.id}`);

  const timezone = entity?.timezone || 'UTC';
  const location = entity?.location
    ? { lat: entity.location.latitude, lng: entity.location.longitude }
    : null;

  const parkSlug = park.slug || slugify(park.name);
  const parkName = PARK_NAME_OVERRIDES[park.id] || park.name;

  // Write park document
  const parkDoc = {
    id: park.id,
    name: parkName,
    slug: parkSlug,
    destinationName: destination.name,
    destinationId: destination.id,
    entityType: 'PARK',
    timezone,
    location,
    updatedAt: Timestamp.now(),
  };

  await adminDb.collection('parks').doc(park.id).set(parkDoc, { merge: true });

  await delay(DELAY_MS);

  // Fetch children (attractions/rides/shows)
  const childData = await fetchJson<{ children: ApiChild[] }>(
    `${API_BASE}/entity/${park.id}/children`
  );

  if (!childData || !childData.children?.length) {
    return { parkSaved: true, attractionCount: 0 };
  }

  const children = childData.children;

  // Batch write attractions
  let written = 0;
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
      written++;
    }

    await batch.commit();
  }

  await delay(DELAY_MS);

  return { parkSaved: true, attractionCount: written };
}

async function main(): Promise<void> {
  const startTime = Date.now();

  const destinations = await getAllDestinations();

  // Sort: US parks first (Disney, Universal, Six Flags, Cedar Fair, SeaWorld, etc.)
  const usKeywords = [
    'disney world', 'disneyland resort', 'universal orlando', 'universal studios hollywood',
    'six flags', 'cedar point', 'kings island', 'kings dominion', 'carowinds',
    'knott', 'great america', 'dorney', 'valleyfair', 'michigan', 'worlds of fun',
    'seaworld', 'busch gardens', 'dollywood', 'hersheypark', 'silver dollar',
    'kennywood', 'knoebels', 'legoland florida', 'legoland california', 'legoland new york',
    'hurricane harbor',
  ];

  const isUS = (name: string) =>
    usKeywords.some((kw) => name.toLowerCase().includes(kw));

  destinations.sort((a, b) => {
    const aUS = isUS(a.name) ? 0 : 1;
    const bUS = isUS(b.name) ? 0 : 1;
    if (aUS !== bUS) return aUS - bUS;
    return a.name.localeCompare(b.name);
  });

  let totalParks = 0;
  let totalAttractions = 0;
  let skippedParks = 0;

  for (const dest of destinations) {
    console.log(`\n🏰 ${dest.name} (${dest.parks.length} park${dest.parks.length > 1 ? 's' : ''})`);

    for (const park of dest.parks) {
      process.stdout.write(`   📍 ${park.name}...`);

      try {
        const result = await syncPark(park, dest);
        if (result.parkSaved) {
          totalParks++;
          totalAttractions += result.attractionCount;
          console.log(` ✓ (${result.attractionCount} attractions)`);
        }
      } catch (e) {
        skippedParks++;
        console.log(` ✗ Error: ${e}`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n════════════════════════════════════════════');
  console.log('  SYNC COMPLETE');
  console.log(`  Parks synced:       ${totalParks}`);
  console.log(`  Attractions synced: ${totalAttractions}`);
  console.log(`  Parks skipped:      ${skippedParks}`);
  console.log(`  Time elapsed:       ${elapsed}s`);
  console.log('════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
