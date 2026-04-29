/** Trust level for crowd-sourcing accuracy. */
export type TrustLevel = 'new' | 'bronze' | 'silver' | 'gold' | 'platinum';

/** User preferences. */
export interface UserPreferences {
  units: 'imperial' | 'metric';
  theme: 'light' | 'dark' | 'system';
  notifications: boolean;
}

/** A user profile stored in Firestore. */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  favoriteParks: string[];
  homepark?: string;
  contributionCount: number;
  trustLevel: TrustLevel;
  badges: string[];
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}
