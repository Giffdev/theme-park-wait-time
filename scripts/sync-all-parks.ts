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
  'bb731eae-7bd3-4713-bd7b-89d79b031743': 'Worlds of Fun',
};

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

interface VirtualSplitConfig {
  sourceId: string;
  virtualParkId: string;
  virtualParkName: string;
  attractionIds: Set<string>;
}

// Virtual splits: single API parks split into multiple parks in our system
const VIRTUAL_SPLITS: VirtualSplitConfig[] = [
  {
    sourceId: 'bb731eae-7bd3-4713-bd7b-89d79b031743',
    virtualParkId: OCEANS_OF_FUN_VIRTUAL_ID,
    virtualParkName: 'Oceans of Fun',
    attractionIds: OCEANS_OF_FUN_ATTRACTION_IDS,
  },
];

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
  const virtualSplit = VIRTUAL_SPLITS.find((vs) => vs.sourceId === park.id);
  let written = 0;
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
      written++;
    }

    await batch.commit();
  }

  // If a virtual split is configured, also create the virtual park document
  if (virtualSplit) {
    const virtualParkDoc = {
      id: virtualSplit.virtualParkId,
      name: virtualSplit.virtualParkName,
      slug: slugify(virtualSplit.virtualParkName),
      destinationName: destination.name,
      destinationId: destination.id,
      entityType: 'PARK',
      isVirtual: true,
      sourceApiParkId: virtualSplit.sourceId,
      timezone,
      location,
      updatedAt: Timestamp.now(),
    };
    await adminDb.collection('parks').doc(virtualSplit.virtualParkId).set(virtualParkDoc, { merge: true });
    written++;
    console.log(`    ✓ Virtual park created: ${virtualSplit.virtualParkName}`);
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
