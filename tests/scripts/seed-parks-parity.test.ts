/**
 * Regression/parity coverage for scripts/seed-parks.ts.
 *
 * Root cause under test: park-registry.ts is the app's source of truth for
 * "supported parks" (it's what routes and detail pages resolve slugs
 * against), but seed-parks.ts used to independently decide which
 * destinations to seed into Firestore by fuzzy keyword matching against the
 * upstream API's destination names. Alton Towers was present in the
 * registry (and therefore linkable/clickable in the UI) but absent from the
 * keyword list, so it was never written to Firestore's `parks`/`attractions`
 * collections — the park-detail page found no matching Firestore doc and
 * rendered "Park details unavailable".
 *
 * These tests pin:
 *  - every configured seed destination id resolves to a real park-registry.ts
 *    destination (typo/parity safety net for future additions),
 *  - Alton Towers specifically is present in the active seed configuration
 *    (regression pin for this bug),
 *  - the id-based matcher correctly resolves registry destinations against
 *    upstream API fixtures, including the Worlds of Fun virtual-split
 *    override, without hitting the network or Firestore.
 */
import { describe, it, expect, vi } from 'vitest';

// seed-parks.ts imports the real Firebase Admin module at the top level,
// which would otherwise try to initialize credentials on import. Mock it so
// only the pure, side-effect-free matching logic under test ever runs.
vi.mock('../../src/lib/firebase/admin', () => ({
  adminDb: {},
  adminApp: {},
}));

import {
  SEED_DESTINATION_IDS,
  getRegistryDestinationIds,
  resolveSeedDestinations,
  resolveParkSlug,
  type Destination,
} from '../../scripts/seed-parks';
import { DESTINATION_FAMILIES } from '@/lib/parks/park-registry';

const ALTON_TOWERS_DESTINATION_ID = '8e6bf2ae-77ac-403d-8e10-d7cd9b6c05d7';
const WORLDS_OF_FUN_DESTINATION_ID = 'c4231018-dc6f-4d8d-bfc2-7a21a6c9e9fa';
const WORLDS_OF_FUN_PARK_ID = 'bb731eae-7bd3-4713-bd7b-89d79b031743';
const ISLANDS_OF_ADVENTURE_PARK_ID = '267615cc-8943-4c2a-ae2c-5da728ca591f';

function apiDestinationFixture(overrides: Partial<Destination> = {}): Destination {
  return {
    id: ALTON_TOWERS_DESTINATION_ID,
    name: 'Alton Towers Resort',
    slug: 'altontowersresort',
    parks: [{ id: '0d8ea921-37b1-4a9a-b8ef-5b45afea847b', name: 'Alton Towers' }],
    ...overrides,
  };
}

describe('scripts/seed-parks.ts — registry/seed parity', () => {
  it('declares Alton Towers in park-registry.ts under the same destination id used for seeding', () => {
    const registryIds = getRegistryDestinationIds();
    expect(registryIds.has(ALTON_TOWERS_DESTINATION_ID)).toBe(true);

    const altonTowersInRegistry = DESTINATION_FAMILIES
      .flatMap((family) => family.destinations)
      .find((dest) => dest.id === ALTON_TOWERS_DESTINATION_ID);
    expect(altonTowersInRegistry?.name).toBe('Alton Towers');
  });

  it('includes Alton Towers in the active seed configuration (regression pin)', () => {
    expect(SEED_DESTINATION_IDS).toContain(ALTON_TOWERS_DESTINATION_ID);
  });

  it('every configured seed destination id exists in park-registry.ts (parity guard)', () => {
    const registryIds = getRegistryDestinationIds();
    for (const id of SEED_DESTINATION_IDS) {
      expect(registryIds.has(id)).toBe(true);
    }
  });

  it('resolves Alton Towers from an upstream API fixture with no special-case config', () => {
    const apiDestinations = [apiDestinationFixture()];

    const matched = resolveSeedDestinations(apiDestinations, [ALTON_TOWERS_DESTINATION_ID]);

    expect(matched).toHaveLength(1);
    expect(matched[0].destination.id).toBe(ALTON_TOWERS_DESTINATION_ID);
    expect(matched[0].destination.parks).toEqual([
      { id: '0d8ea921-37b1-4a9a-b8ef-5b45afea847b', name: 'Alton Towers' },
    ]);
    expect(matched[0].config).toEqual({});
  });

  it('seeds both Worlds of Fun and Oceans of Fun directly as real, independent parks (no virtual split)', () => {
    // ThemeParks Wiki now reports Oceans of Fun as its own standalone entity
    // (b5a89552-3381-47ad-88cc-ab0087019c8b, matching park-registry.ts) rather
    // than only as attractions nested under Worlds of Fun, so the destination
    // override should seed both real park ids directly with no attraction-level
    // fabrication.
    const apiDestinations = [
      apiDestinationFixture({
        id: WORLDS_OF_FUN_DESTINATION_ID,
        name: 'Worlds of Fun',
        slug: 'enchantedparks_worldsoffun',
        parks: [
          { id: WORLDS_OF_FUN_PARK_ID, name: 'Worlds of Fun' },
          { id: 'b5a89552-3381-47ad-88cc-ab0087019c8b', name: 'Oceans of Fun' },
        ],
      }),
    ];

    const matched = resolveSeedDestinations(apiDestinations, [WORLDS_OF_FUN_DESTINATION_ID]);

    expect(matched).toHaveLength(1);
    expect(matched[0].config.parkFilter).toEqual([
      WORLDS_OF_FUN_PARK_ID,
      'b5a89552-3381-47ad-88cc-ab0087019c8b',
    ]);
    expect(matched[0].config.timezoneOverride).toBe('America/Chicago');
    expect(matched[0].config.virtualSplit).toBeUndefined();
  });

  it('throws when a configured seed id is not a real park-registry.ts destination (typo safety)', () => {
    const apiDestinations = [apiDestinationFixture()];
    const bogusId = '00000000-0000-0000-0000-000000000000';

    expect(() => resolveSeedDestinations(apiDestinations, [bogusId])).toThrow(
      /not a destination in park-registry\.ts/i
    );
  });

  it('skips (rather than throws) a registry-valid destination that is temporarily absent upstream', () => {
    // Alton Towers is a real registry destination but not present in this
    // API fixture — should be skipped gracefully, not treated as a typo.
    const matched = resolveSeedDestinations([], [ALTON_TOWERS_DESTINATION_ID]);
    expect(matched).toEqual([]);
  });

  it('resolves every currently configured seed destination against real upstream data without throwing', async () => {
    // Exercises the full active SEED_DESTINATION_IDS list (Orlando + Worlds of
    // Fun + Alton Towers) against real ThemeParks Wiki id/name pairs, so a
    // future edit to SEED_DESTINATION_IDS that drifts from the registry is
    // caught here rather than at seed-run time in production.
    const apiDestinations: Destination[] = [
      { id: 'e957da41-3552-4cf6-b636-5babc5cbc4e5', name: "Walt Disney World® Resort", slug: 'waltdisneyworldresort', parks: [] },
      { id: '89db5d43-c434-4097-b71f-f6869f495a22', name: 'Universal Orlando Resort', slug: 'universalresort_orlando', parks: [] },
      { id: '643e837e-b244-4663-8d3a-148c26ecba9c', name: 'SeaWorld Parks and Resorts Orlando', slug: 'seaworldorlandoresort', parks: [] },
      { id: WORLDS_OF_FUN_DESTINATION_ID, name: 'Worlds of Fun', slug: 'enchantedparks_worldsoffun', parks: [] },
      { id: ALTON_TOWERS_DESTINATION_ID, name: 'Alton Towers Resort', slug: 'altontowersresort', parks: [] },
    ];

    const matched = resolveSeedDestinations(apiDestinations);

    expect(matched.map((m) => m.destination.id).sort()).toEqual(
      [...SEED_DESTINATION_IDS].sort()
    );
  });
});

describe('scripts/seed-parks.ts — resolveParkSlug (registry/upstream slug identity)', () => {
  // Root cause: Islands of Adventure was seeded with the upstream ThemeParks
  // Wiki API's own slug field ("universal-islands-of-adventure") instead of
  // park-registry.ts's canonical slug ("islands-of-adventure"), because the
  // seed script preferred `park.slug` unconditionally. The park-detail page
  // resolves Firestore docs via an exact `where('slug', '==', ...)` match
  // against the registry-derived route param, so the drifted doc was
  // unreachable via the canonical URL.

  it('prefers the park-registry.ts slug over the upstream API slug when both exist', () => {
    const upstreamPark = {
      id: ISLANDS_OF_ADVENTURE_PARK_ID,
      slug: 'universal-islands-of-adventure',
      name: 'Islands of Adventure',
    };

    expect(resolveParkSlug(upstreamPark)).toBe('islands-of-adventure');
  });

  it('falls back to the upstream API slug for a park not yet present in park-registry.ts', () => {
    const upstreamPark = {
      id: '00000000-0000-0000-0000-000000000000',
      slug: 'some-new-park',
      name: 'Some New Park',
    };

    expect(resolveParkSlug(upstreamPark)).toBe('some-new-park');
  });

  it('falls back to a slugified name when neither the registry nor the upstream API provides a slug', () => {
    const upstreamPark = {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Some New Park!',
    };

    expect(resolveParkSlug(upstreamPark)).toBe('some-new-park');
  });

  it('resolves every registry park id to its own registry slug (parity guard against future drift)', () => {
    for (const family of DESTINATION_FAMILIES) {
      for (const dest of family.destinations) {
        for (const park of dest.parks) {
          // Simulate the upstream API reporting a divergent slug for every
          // park — the registry slug must always win when the park id is
          // known, regardless of what upstream happens to report.
          const upstreamPark = { id: park.id, slug: `upstream-${park.id}`, name: park.name };
          expect(resolveParkSlug(upstreamPark)).toBe(park.slug);
        }
      }
    }
  });
});
