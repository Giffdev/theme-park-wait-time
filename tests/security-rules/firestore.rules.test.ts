/**
 * Firestore Security Rules integration tests.
 *
 * Run against the Firebase Emulator:
 *   npm run test:rules
 *
 * These tests verify every allow/deny case in firestore.rules against
 * the access matrix defined in docs/TEST-STRATEGY.md §5.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  getTestEnv,
  authenticatedContext,
  unauthenticatedContext,
  clearFirestoreData,
  cleanupTestEnv,
} from '@/lib/test-utils/firebase-test-helpers';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await getTestEnv();
});

afterAll(async () => {
  await cleanupTestEnv();
});

beforeEach(async () => {
  await clearFirestoreData(testEnv);
});

// ---------------------------------------------------------------------------
// Helper: seed a document via the admin/unauthed bypass context
// ---------------------------------------------------------------------------
async function seedDoc(path: string, data: Record<string, unknown>) {
  const admin = testEnv.unauthenticatedContext(); // rules tests use withSecurityRulesDisabled
  // Use withSecurityRulesDisabled to seed data
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const ref = doc(context.firestore(), path);
    await setDoc(ref, data);
  });
}

// ===========================================================================
// 1. PARKS — Public read, admin-only write
// ===========================================================================
describe('Parks collection', () => {
  const parkPath = 'parks/magic-kingdom';
  const parkData = { name: 'Magic Kingdom', isActive: true };

  beforeEach(async () => {
    await seedDoc(parkPath, parkData);
  });

  it('allows unauthenticated read', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), parkPath);
    await expect(getDoc(ref)).resolves.toBeDefined();
  });

  it('allows authenticated read', async () => {
    const ctx = authenticatedContext(testEnv, 'user-1');
    const ref = doc(ctx.firestore(), parkPath);
    await expect(getDoc(ref)).resolves.toBeDefined();
  });

  it('denies unauthenticated write', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), parkPath);
    await expect(setDoc(ref, parkData)).rejects.toThrow();
  });

  it('denies authenticated write (non-admin)', async () => {
    const ctx = authenticatedContext(testEnv, 'user-1');
    const ref = doc(ctx.firestore(), parkPath);
    await expect(setDoc(ref, parkData)).rejects.toThrow();
  });
});

// ===========================================================================
// 2. ATTRACTIONS — Public read, admin-only write
// ===========================================================================
describe('Attractions subcollection', () => {
  const attractionPath = 'parks/magic-kingdom/attractions/space-mountain';
  const attractionData = { name: 'Space Mountain', type: 'thrill', isActive: true };

  beforeEach(async () => {
    await seedDoc(attractionPath, attractionData);
  });

  it('allows unauthenticated read', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), attractionPath);
    await expect(getDoc(ref)).resolves.toBeDefined();
  });

  it('denies unauthenticated write', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), attractionPath);
    await expect(setDoc(ref, attractionData)).rejects.toThrow();
  });

  it('denies authenticated write', async () => {
    const ctx = authenticatedContext(testEnv, 'user-1');
    const ref = doc(ctx.firestore(), attractionPath);
    await expect(setDoc(ref, attractionData)).rejects.toThrow();
  });
});

// ===========================================================================
// 3. CURRENT WAIT TIMES — Public read, server-only write
// ===========================================================================
describe('Current wait times', () => {
  const waitTimePath = 'parks/magic-kingdom/currentWaitTimes/space-mountain';
  const waitData = { waitMinutes: 45, status: 'operating', source: 'api' };

  beforeEach(async () => {
    await seedDoc(waitTimePath, waitData);
  });

  it('allows unauthenticated read', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), waitTimePath);
    await expect(getDoc(ref)).resolves.toBeDefined();
  });

  it('denies client write', async () => {
    const ctx = authenticatedContext(testEnv, 'user-1');
    const ref = doc(ctx.firestore(), waitTimePath);
    await expect(setDoc(ref, waitData)).rejects.toThrow();
  });
});

// ===========================================================================
// 4. WAIT TIME HISTORY — Public read, server-only write
// ===========================================================================
describe('Wait time history', () => {
  const historyPath = 'waitTimeHistory/mk_space-mountain_2026-04-28';
  const historyData = { parkId: 'magic-kingdom', date: '2026-04-28', readings: [] };

  beforeEach(async () => {
    await seedDoc(historyPath, historyData);
  });

  it('allows unauthenticated read', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), historyPath);
    await expect(getDoc(ref)).resolves.toBeDefined();
  });

  it('denies client write', async () => {
    const ctx = authenticatedContext(testEnv, 'user-1');
    const ref = doc(ctx.firestore(), historyPath);
    await expect(setDoc(ref, historyData)).rejects.toThrow();
  });
});

// ===========================================================================
// 5. CROWD CALENDAR — Public read, server-only write
// ===========================================================================
describe('Crowd calendar', () => {
  const calPath = 'crowdCalendar/magic-kingdom_2026-04';
  const calData = { parkId: 'magic-kingdom', month: '2026-04', days: {} };

  beforeEach(async () => {
    await seedDoc(calPath, calData);
  });

  it('allows unauthenticated read', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), calPath);
    await expect(getDoc(ref)).resolves.toBeDefined();
  });

  it('denies client write', async () => {
    const ctx = authenticatedContext(testEnv, 'user-1');
    const ref = doc(ctx.firestore(), calPath);
    await expect(setDoc(ref, calData)).rejects.toThrow();
  });
});

// ===========================================================================
// 6. USERS — Owner-only read/write
// ===========================================================================
describe('Users collection', () => {
  const userId = 'user-abc';
  const userPath = `users/${userId}`;
  const userData = {
    uid: userId,
    email: 'test@example.com',
    displayName: 'Test User',
  };

  beforeEach(async () => {
    await seedDoc(userPath, userData);
  });

  it('denies unauthenticated read', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), userPath);
    await expect(getDoc(ref)).rejects.toThrow();
  });

  it('allows owner to read own profile', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), userPath);
    await expect(getDoc(ref)).resolves.toBeDefined();
  });

  it('denies other user from reading profile', async () => {
    const ctx = authenticatedContext(testEnv, 'other-user');
    const ref = doc(ctx.firestore(), userPath);
    await expect(getDoc(ref)).rejects.toThrow();
  });

  it('allows owner to create own profile', async () => {
    const newUserId = 'new-user';
    const ctx = authenticatedContext(testEnv, newUserId);
    const ref = doc(ctx.firestore(), `users/${newUserId}`);
    await expect(
      setDoc(ref, { uid: newUserId, email: 'new@test.com', displayName: 'New' }),
    ).resolves.toBeUndefined();
  });

  it('allows owner to update own profile', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), userPath);
    await expect(updateDoc(ref, { displayName: 'Updated' })).resolves.toBeUndefined();
  });

  it('denies other user from updating profile', async () => {
    const ctx = authenticatedContext(testEnv, 'other-user');
    const ref = doc(ctx.firestore(), userPath);
    await expect(updateDoc(ref, { displayName: 'Hacked' })).rejects.toThrow();
  });

  it('denies delete for everyone (admin SDK only)', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), userPath);
    await expect(deleteDoc(ref)).rejects.toThrow();
  });
});

// ===========================================================================
// 7. USER TRIPS / RIDE LOGS — Owner-only
// ===========================================================================
describe('User trips and ride logs', () => {
  const userId = 'user-abc';
  const tripPath = `users/${userId}/trips/trip-1`;
  const rideLogPath = `users/${userId}/trips/trip-1/rideLogs/log-1`;
  const tripData = { startDate: '2026-04-28', endDate: '2026-04-30', totalRides: 5 };
  const rideLogData = { attractionId: 'space-mountain', waitTime: 25 };

  beforeEach(async () => {
    await seedDoc(tripPath, tripData);
    await seedDoc(rideLogPath, rideLogData);
  });

  it('denies unauthenticated read of trips', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), tripPath);
    await expect(getDoc(ref)).rejects.toThrow();
  });

  it('allows owner to read own trips', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), tripPath);
    await expect(getDoc(ref)).resolves.toBeDefined();
  });

  it('denies other user from reading trips', async () => {
    const ctx = authenticatedContext(testEnv, 'other-user');
    const ref = doc(ctx.firestore(), tripPath);
    await expect(getDoc(ref)).rejects.toThrow();
  });

  it('allows owner to read own ride logs', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), rideLogPath);
    await expect(getDoc(ref)).resolves.toBeDefined();
  });

  it('allows owner to write ride logs', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), `users/${userId}/trips/trip-1/rideLogs/log-new`);
    await expect(setDoc(ref, rideLogData)).resolves.toBeUndefined();
  });

  it('denies other user from writing ride logs', async () => {
    const ctx = authenticatedContext(testEnv, 'other-user');
    const ref = doc(ctx.firestore(), rideLogPath);
    await expect(setDoc(ref, rideLogData)).rejects.toThrow();
  });
});

// ===========================================================================
// 8. CROWD REPORTS — Public read, auth create, author-only update
// ===========================================================================
describe('Crowd reports', () => {
  const userId = 'user-abc';
  const reportPath = 'crowdReports/report-1';
  const reportData = {
    parkId: 'magic-kingdom',
    attractionId: 'space-mountain',
    userId,
    displayName: 'Test Reporter',
    waitMinutes: 30,
    status: 'pending',
    reportedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  };

  beforeEach(async () => {
    await seedDoc(reportPath, reportData);
  });

  it('allows unauthenticated read', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), reportPath);
    await expect(getDoc(ref)).resolves.toBeDefined();
  });

  it('denies unauthenticated create', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), 'crowdReports/new-report');
    await expect(setDoc(ref, { ...reportData, userId: 'anon' })).rejects.toThrow();
  });

  it('allows authenticated user to create report with own userId', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), 'crowdReports/new-report');
    await expect(setDoc(ref, reportData)).resolves.toBeUndefined();
  });

  it('denies create when userId does not match auth uid', async () => {
    const ctx = authenticatedContext(testEnv, 'different-user');
    const ref = doc(ctx.firestore(), 'crowdReports/spoofed');
    await expect(setDoc(ref, reportData)).rejects.toThrow();
  });

  it('denies create when waitMinutes > 300', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), 'crowdReports/too-high');
    await expect(
      setDoc(ref, { ...reportData, waitMinutes: 301 }),
    ).rejects.toThrow();
  });

  it('denies create when waitMinutes < -1', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), 'crowdReports/too-low');
    await expect(
      setDoc(ref, { ...reportData, waitMinutes: -2 }),
    ).rejects.toThrow();
  });

  it('allows author to update own report', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), reportPath);
    await expect(updateDoc(ref, { waitMinutes: 35 })).resolves.toBeUndefined();
  });

  it('denies non-author from updating report', async () => {
    const ctx = authenticatedContext(testEnv, 'other-user');
    const ref = doc(ctx.firestore(), reportPath);
    await expect(updateDoc(ref, { waitMinutes: 999 })).rejects.toThrow();
  });

  it('denies delete for everyone', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), reportPath);
    await expect(deleteDoc(ref)).rejects.toThrow();
  });
});

// ===========================================================================
// 9. CROWD REPORT VERIFICATIONS — Public read, auth create, no update/delete
// ===========================================================================
describe('Crowd report verifications', () => {
  const userId = 'user-abc';
  const verPath = 'crowdReports/report-1/verifications/ver-1';
  const verData = {
    userId,
    isAccurate: true,
    confidence: 'high',
    verifiedAt: new Date(),
  };

  beforeEach(async () => {
    await seedDoc('crowdReports/report-1', {
      parkId: 'magic-kingdom',
      attractionId: 'space-mountain',
      userId: 'original-author',
      waitMinutes: 30,
      status: 'pending',
    });
  });

  it('allows unauthenticated read', async () => {
    await seedDoc(verPath, verData);
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), verPath);
    await expect(getDoc(ref)).resolves.toBeDefined();
  });

  it('allows authenticated user to create verification', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), verPath);
    await expect(setDoc(ref, verData)).resolves.toBeUndefined();
  });

  it('denies unauthenticated create', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), verPath);
    await expect(setDoc(ref, verData)).rejects.toThrow();
  });

  it('denies update of verification', async () => {
    await seedDoc(verPath, verData);
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), verPath);
    await expect(updateDoc(ref, { isAccurate: false })).rejects.toThrow();
  });

  it('denies delete of verification', async () => {
    await seedDoc(verPath, verData);
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), verPath);
    await expect(deleteDoc(ref)).rejects.toThrow();
  });
});
