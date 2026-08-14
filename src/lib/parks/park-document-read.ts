import {
  getParkById,
  getParkBySlug,
  isRetiredParkId,
  resolveCurrentParkId,
} from './park-registry';

export interface ParkIdentityDocument {
  id: string;
  slug?: string;
}

/**
 * Keep only application-supported canonical park documents.
 *
 * Firestore currently contains a wider historical/upstream universe than the
 * application registry. Public park pickers and routes must use the registry
 * boundary so unsupported or retired documents cannot become extra park cards.
 * This remains id-based rather than slug-based because two real parks may have
 * shared an upstream slug.
 */
export function filterCurrentParkDocuments<T extends ParkIdentityDocument>(docs: T[]): T[] {
  const canonicalById = new Map<string, T>();
  for (const doc of docs) {
    if (isRetiredParkId(doc.id) || !getParkById(doc.id) || canonicalById.has(doc.id)) {
      continue;
    }
    const canonical = getParkById(doc.id)!;
    canonicalById.set(doc.id, {
      ...doc,
      name: canonical.name,
      slug: canonical.slug,
      destinationId: canonical.destinationId,
      destinationName: canonical.destinationName,
      familyId: canonical.familyId,
      familyName: canonical.familyName,
    });
  }
  return [...canonicalById.values()];
}

/**
 * Select one park from a Firestore slug query without allowing a retired
 * identity to win its otherwise-unordered result set.
 */
export function selectCurrentParkDocument<T extends ParkIdentityDocument>(
  docs: T[],
  slug: string
): T | undefined {
  const registryPark = getParkBySlug(slug);
  if (!registryPark || registryPark.slug !== slug) return undefined;

  const canonicalId = resolveCurrentParkId(registryPark.id);
  return filterCurrentParkDocuments(docs).find((doc) => doc.id === canonicalId);
}
