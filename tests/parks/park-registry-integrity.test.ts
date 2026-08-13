/**
 * Deterministic integrity checks for park-registry.ts, added after a data
 * audit found two classes of corruption that upstream API calls (silently)
 * turned into 404s / "unavailable" park pages:
 *
 *  - 11 destination/park ids had a single duplicated hex digit inserted
 *    mid-string (37 chars instead of the correct 36), so they no longer
 *    matched any real ThemeParks Wiki entity.
 *  - Oceans of Fun's id referenced a decommissioned/renumbered entity that
 *    404s, rather than the park's real current entity id.
 *
 * Neither class of defect is caught by TypeScript (both are syntactically
 * valid strings) or by any runtime code path that doesn't happen to be
 * exercised against the live API. These tests pin: (1) every id in the
 * registry is a well-formed UUID, so a future copy/paste/typo regression
 * fails fast in CI instead of surfacing as an "unavailable" park in
 * production, and (2) every derived per-family registry (PARK_FAMILIES,
 * PARK_FAMILY_REGISTRY) exposes the same underlying set of parks as the
 * canonical DESTINATION_FAMILIES source, so a future divergence in one of
 * the derived views can't quietly drop or duplicate a park.
 */
import { describe, it, expect } from 'vitest';
import { DESTINATION_FAMILIES } from '@/lib/parks/park-registry';
import { PARK_FAMILIES } from '@/lib/constants';
import { PARK_FAMILY_REGISTRY } from '@/lib/crowd-calendar/park-families';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('park-registry.ts — deterministic integrity', () => {
  it('every destination id is a well-formed UUID', () => {
    const malformed: string[] = [];
    for (const family of DESTINATION_FAMILIES) {
      for (const dest of family.destinations) {
        if (!UUID_RE.test(dest.id)) {
          malformed.push(`${dest.name} (destination): ${dest.id}`);
        }
      }
    }
    expect(malformed).toEqual([]);
  });

  it('every park id is a well-formed UUID', () => {
    const malformed: string[] = [];
    for (const family of DESTINATION_FAMILIES) {
      for (const dest of family.destinations) {
        for (const park of dest.parks) {
          if (!UUID_RE.test(park.id)) {
            malformed.push(`${park.name} (park, dest ${dest.name}): ${park.id}`);
          }
        }
      }
    }
    expect(malformed).toEqual([]);
  });

  it('has no duplicate park ids across the registry (would indicate a copy/paste id collision)', () => {
    const seen = new Map<string, string[]>();
    for (const family of DESTINATION_FAMILIES) {
      for (const dest of family.destinations) {
        for (const park of dest.parks) {
          const names = seen.get(park.id) ?? [];
          names.push(`${dest.name} / ${park.name}`);
          seen.set(park.id, names);
        }
      }
    }
    const duplicates = [...seen.entries()].filter(([, names]) => names.length > 1);
    expect(duplicates).toEqual([]);
  });

  it('regression pin: Oceans of Fun resolves to its real, current entity id', () => {
    const oceansOfFun = DESTINATION_FAMILIES.flatMap((f) => f.destinations)
      .flatMap((d) => d.parks)
      .find((p) => p.name === 'Oceans of Fun');
    expect(oceansOfFun?.id).toBe('b5a89552-3381-47ad-88cc-ab0087019c8b');
  });

  it('regression pin: previously-malformed ids are now well-formed 36-char UUIDs', () => {
    const allParks = DESTINATION_FAMILIES.flatMap((f) => f.destinations).flatMap((d) => d.parks);
    const byName = (name: string) => allParks.find((p) => p.name === name);

    expect(byName('Universal Studios Florida')?.id).toBe('eb3f4560-2383-4a36-9152-6b3e5ed6bc57');
    expect(byName('Epic Universe')?.id).toBe('12dbb85b-265f-44e6-bccf-f1faa17211fc');
    expect(byName('Volcano Bay')?.id).toBe('fe78a026-b91b-470c-b906-9d2266b692da');
    expect(byName('Universal Studios Beijing')?.id).toBe('68e1d8f0-ed42-4351-af25-160421e37ce0');
    expect(byName('Universal Studios Singapore')?.id).toBe('f95d7f76-2024-4510-b799-26e122d0e448');
    expect(byName('Six Flags Magic Mountain')?.id).toBe('c6073ab0-83aa-4e25-8d60-12c8f25684bc');
    expect(byName('Six Flags Great America')?.id).toBe('15805a4d-4023-4702-b9f2-3d3cab2e0c1e');
    expect(byName('Six Flags Discovery Kingdom')?.id).toBe('3237a0c2-8e35-4a1c-9356-a319d5988e7c');
    expect(byName('Six Flags Frontier City')?.id).toBe('589627eb-fe16-4373-a2db-08d73805fb1f');
    expect(byName('SeaWorld Orlando')?.id).toBe('27d64dee-d85e-48dc-ad6d-8077445cd946');
    expect(byName('Aquatica Orlando')?.id).toBe('9e2867f8-68eb-454f-b367-0ed0fd72d72a');
  });
});

describe('park-registry.ts — derived-view parity (PARK_FAMILIES / PARK_FAMILY_REGISTRY)', () => {
  function registryParkIds(): Set<string> {
    return new Set(
      DESTINATION_FAMILIES.flatMap((f) => f.destinations).flatMap((d) => d.parks.map((p) => p.id))
    );
  }

  it('PARK_FAMILY_REGISTRY (UUID-based) exposes exactly the same park ids as DESTINATION_FAMILIES', () => {
    const canonical = registryParkIds();
    const derived = new Set(PARK_FAMILY_REGISTRY.flatMap((f) => f.parks.map((p) => p.parkId)));
    expect(derived).toEqual(canonical);
  });

  it('PARK_FAMILIES (slug-based) resolves — via resolveScheduleParkId-equivalent slug lookup — to exactly the same park ids as DESTINATION_FAMILIES', () => {
    const canonical = registryParkIds();
    const slugToId = new Map<string, string>();
    for (const family of DESTINATION_FAMILIES) {
      for (const dest of family.destinations) {
        for (const park of dest.parks) {
          slugToId.set(park.slug, park.id);
        }
      }
    }

    const derivedIds = new Set(
      PARK_FAMILIES.flatMap((f) => f.parks.map((p) => slugToId.get(p.id))).filter(
        (id): id is string => !!id
      )
    );

    // Every slug PARK_FAMILIES exposes must resolve to a real registry id
    // (no orphaned/unresolvable slugs), and the resulting id set must match
    // the canonical registry exactly (no dropped or duplicated parks).
    const unresolvable = PARK_FAMILIES.flatMap((f) => f.parks).filter((p) => !slugToId.has(p.id));
    expect(unresolvable).toEqual([]);
    expect(derivedIds).toEqual(canonical);
  });

  it('PARK_FAMILIES and PARK_FAMILY_REGISTRY have the same family ids in the same order', () => {
    expect(PARK_FAMILIES.map((f) => f.id)).toEqual(PARK_FAMILY_REGISTRY.map((f) => f.id));
  });
});
