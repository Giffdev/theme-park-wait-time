import type { AttractionType } from '@/types/attraction';

/**
 * Returns an emoji icon appropriate for the given entity/attraction type.
 * Priority: entityType (broad category) → attractionType (ride sub-type) → generic fallback.
 */
export function getAttractionIcon(entityType?: string, attractionType?: AttractionType | null): string {
  // Entity-level categories (from ThemeParks Wiki API)
  if (entityType === 'RESTAURANT') return '🍽️';
  if (entityType === 'SHOP' || entityType === 'MERCHANDISE') return '🛍️';
  if (entityType === 'HOTEL') return '🏨';
  if (entityType === 'MEET_AND_GREET') return '🤝';
  if (entityType === 'SHOW') return '🎭';

  // Attraction sub-types (from enrichment / manual tagging)
  if (attractionType === 'thrill') return '🎢';
  if (attractionType === 'family') return '🎠';
  if (attractionType === 'show') return '🎭';
  if (attractionType === 'character-meet') return '🤝';
  if (attractionType === 'experience') return '✨';
  if (attractionType === 'parade') return '🎉';
  if (attractionType === 'dining-experience') return '🍽️';

  // Generic ride/attraction fallback
  if (entityType === 'ATTRACTION' || entityType === 'RIDE') return '🎡';

  // Unknown/unclassified
  return '📍';
}
