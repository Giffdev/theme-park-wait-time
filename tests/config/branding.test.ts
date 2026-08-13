import { describe, expect, it } from 'vitest';
import { APP_NAME } from '@/lib/constants';
import {
  FAVORITES_STORAGE_KEY,
  LEGACY_FAVORITES_STORAGE_KEY,
} from '@/lib/parks/favorite-families';

describe('ParkPulse branding contract', () => {
  it('uses the ParkPulse name while retaining the ParkFlow favorites key only for migration', () => {
    expect(APP_NAME).toBe('ParkPulse');
    expect(FAVORITES_STORAGE_KEY).toBe('parkpulse-favorite-families');
    expect(LEGACY_FAVORITES_STORAGE_KEY).toBe('parkflow-favorite-families');
  });
});
