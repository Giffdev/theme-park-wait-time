import { describe, expect, it, vi } from 'vitest';
import {
  FAVORITES_STORAGE_KEY,
  LEGACY_FAVORITES_STORAGE_KEY,
  loadFavoriteFamilyIds,
  saveFavoriteFamilyIds,
} from '@/lib/parks/favorite-families';

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    values,
  };
}

describe('favorite family storage', () => {
  it('migrates ParkFlow favorites to ParkPulse without losing IDs', () => {
    const storage = createStorage({
      [LEGACY_FAVORITES_STORAGE_KEY]: JSON.stringify(['wdw', 'universal-orlando']),
    });

    expect(loadFavoriteFamilyIds(storage)).toEqual(['wdw', 'universal-orlando']);
    expect(storage.values.get(FAVORITES_STORAGE_KEY)).toBe(
      JSON.stringify(['wdw', 'universal-orlando'])
    );
    expect(storage.values.has(LEGACY_FAVORITES_STORAGE_KEY)).toBe(false);
  });

  it('merges current and legacy favorites during a partial migration', () => {
    const storage = createStorage({
      [FAVORITES_STORAGE_KEY]: JSON.stringify(['wdw']),
      [LEGACY_FAVORITES_STORAGE_KEY]: JSON.stringify(['universal-orlando']),
    });

    expect(loadFavoriteFamilyIds(storage)).toEqual(['wdw', 'universal-orlando']);
  });

  it('keeps the legacy key when the migrated value cannot be persisted', () => {
    const storage = createStorage({
      [LEGACY_FAVORITES_STORAGE_KEY]: JSON.stringify(['wdw']),
    });
    storage.setItem.mockImplementation(() => {
      throw new Error('storage quota exceeded');
    });

    expect(loadFavoriteFamilyIds(storage)).toEqual(['wdw']);
    expect(storage.values.get(LEGACY_FAVORITES_STORAGE_KEY)).toBe(JSON.stringify(['wdw']));
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('saves new favorites under the ParkPulse key', () => {
    const storage = createStorage();

    saveFavoriteFamilyIds(storage, ['disneyland']);

    expect(storage.values.get(FAVORITES_STORAGE_KEY)).toBe(JSON.stringify(['disneyland']));
  });
});
