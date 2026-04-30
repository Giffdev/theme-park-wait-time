import type { ParkFamilyDefinition } from '@/types/parkFamily';
import { DESTINATION_FAMILIES } from '@/lib/parks/park-registry';

/**
 * Static registry of park families (resort destinations) derived from the canonical park registry.
 * IDs are used as Firestore document paths and API parameters.
 * Park IDs reference ThemeParks Wiki entity UUIDs.
 */
export const PARK_FAMILY_REGISTRY: ParkFamilyDefinition[] = DESTINATION_FAMILIES.flatMap(
  (group) =>
    group.destinations.map((dest) => ({
      id: dest.slug.replace(/-dest$/, ''),
      name: dest.name,
      slug: dest.slug,
      parks: dest.parks.map((p) => ({ parkId: p.id, parkName: p.name })),
    }))
);

/** Find a park family by its ID. */
export function getParkFamily(familyId: string): ParkFamilyDefinition | undefined {
  return PARK_FAMILY_REGISTRY.find((f) => f.id === familyId);
}

/** Get all park family IDs. */
export function getAllFamilyIds(): string[] {
  return PARK_FAMILY_REGISTRY.map((f) => f.id);
}
