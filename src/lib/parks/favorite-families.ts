export const FAVORITES_STORAGE_KEY = 'parkpulse-favorite-families';
export const LEGACY_FAVORITES_STORAGE_KEY = 'parkflow-favorite-families';

interface FavoriteStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function parseFavoriteIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function loadFavoriteFamilyIds(storage: FavoriteStorage): string[] {
  const current = parseFavoriteIds(storage.getItem(FAVORITES_STORAGE_KEY));
  const legacy = parseFavoriteIds(storage.getItem(LEGACY_FAVORITES_STORAGE_KEY));
  const merged = [...new Set([...current, ...legacy])];

  if (legacy.length > 0) {
    try {
      storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(merged));
      storage.removeItem(LEGACY_FAVORITES_STORAGE_KEY);
    } catch {
      // Keep the legacy key intact if migration cannot be persisted.
    }
  }

  return merged;
}

export function saveFavoriteFamilyIds(storage: FavoriteStorage, familyIds: string[]): void {
  storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(familyIds));
}
