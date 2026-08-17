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
  getDocs,
  query,
  where,
  orderBy,
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
  const legacyWaitTimePath = 'parks/magic-kingdom/currentWaitTimes/space-mountain';
  const waitTimePath = 'waitTimes/magic-kingdom/current/space-mountain';
  const waitData = { waitMinutes: 45, status: 'operating', source: 'api' };

  beforeEach(async () => {
    await seedDoc(legacyWaitTimePath, waitData);
    await seedDoc(waitTimePath, waitData);
  });

  it('allows unauthenticated document read from the API write path', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), waitTimePath);
    await expect(getDoc(ref)).resolves.toBeDefined();
  });

  it('allows unauthenticated collection reads used by park pages', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = collection(ctx.firestore(), 'waitTimes/magic-kingdom/current');
    await expect(getDocs(ref)).resolves.toBeDefined();
  });

  it('allows authenticated reads', async () => {
    const ctx = authenticatedContext(testEnv, 'user-1');
    const ref = doc(ctx.firestore(), waitTimePath);
    await expect(getDoc(ref)).resolves.toBeDefined();
  });

  it('denies unauthenticated client writes', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), waitTimePath);
    await expect(setDoc(ref, waitData)).rejects.toThrow();
  });

  it('denies authenticated client writes', async () => {
    const ctx = authenticatedContext(testEnv, 'user-1');
    const ref = doc(ctx.firestore(), waitTimePath);
    await expect(setDoc(ref, waitData)).rejects.toThrow();
  });

  it('does not expose sibling waitTimes subcollections', async () => {
    const privatePath = 'waitTimes/magic-kingdom/internal/diagnostics';
    await seedDoc(privatePath, { upstreamStatus: 200 });
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), privatePath);
    await expect(getDoc(ref)).rejects.toThrow();
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
// 8. LEGACY CROWD REPORTS — server-only because documents contain PII
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

  it('denies unauthenticated read of PII-bearing legacy reports', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), reportPath);
    await expect(getDoc(ref)).rejects.toThrow();
  });

  it('denies unauthenticated create', async () => {
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), 'crowdReports/new-report');
    await expect(setDoc(ref, { ...reportData, userId: 'anon' })).rejects.toThrow();
  });

  it('denies authenticated client creation even with own userId', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), 'crowdReports/new-report');
    await expect(setDoc(ref, reportData)).rejects.toThrow();
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

  it('denies author updates to legacy reports', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), reportPath);
    await expect(updateDoc(ref, { waitMinutes: 35 })).rejects.toThrow();
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
// 9. CROWD REPORT VERIFICATIONS — server-only because children contain PII
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

  describe('Anonymous wait-time reports', () => {
      const attractionPath = 'attractions/space-mountain';
      const validReport = {
        schemaVersion: 1,
        attractionId: 'space-mountain',
        attractionName: 'Space Mountain',
        parkId: 'magic-kingdom',
        waitTime: 30,
        reportedAt: new Date(),
        status: 'pending',
      };

      beforeEach(async () => {
        await seedDoc(attractionPath, {
          name: 'Space Mountain',
          parkId: 'magic-kingdom',
          entityType: 'ATTRACTION',
        });
      });

      it('denies authenticated direct writes even with an exact anonymous shape', async () => {
        const ctx = authenticatedContext(testEnv, 'user-1');
        await expect(setDoc(
          doc(ctx.firestore(), 'waitTimeReports/report-request-1234'),
          validReport,
        )).rejects.toThrow();
      });

      it('denies unauthenticated reports', async () => {
        const ctx = unauthenticatedContext(testEnv);
        await expect(setDoc(
          doc(ctx.firestore(), 'waitTimeReports/report-request-1234'),
          validReport,
        )).rejects.toThrow();
      });

      it.each([
        ['stable UID', { userId: 'user-1' }],
        ['email', { email: 'person@example.com' }],
        ['display name', { username: 'Person' }],
        ['unknown field', { source: 'client' }],
      ])('denies public privacy/schema pollution: %s', async (_label, extra) => {
        const ctx = authenticatedContext(testEnv, 'user-1');
        await expect(setDoc(
          doc(ctx.firestore(), `waitTimeReports/privacy-${Object.keys(extra)[0]}-1234`),
          { ...validReport, ...extra },
        )).rejects.toThrow();
      });

      it.each([
        ['mismatched park', { parkId: 'epcot' }],
        ['spoofed attraction name', { attractionName: 'Fake Mountain' }],
        ['missing attraction', { attractionId: 'not-real' }],
        ['out-of-range wait', { waitTime: 301 }],
        ['fractional wait', { waitTime: 12.5 }],
      ])('denies canonical/report spoofing: %s', async (_label, changed) => {
        const ctx = authenticatedContext(testEnv, 'user-1');
        await expect(setDoc(
          doc(ctx.firestore(), `waitTimeReports/spoof-${String(changed.waitTime ?? changed.parkId ?? changed.attractionId ?? 'name')}`),
          { ...validReport, ...changed },
        )).rejects.toThrow();
      });

      it('denies direct idempotent replay and mutation (server-only writes)', async () => {
        await seedDoc('waitTimeReports/idempotent-report-1234', validReport);
        const ctx = authenticatedContext(testEnv, 'user-1');
        const ref = doc(ctx.firestore(), 'waitTimeReports/idempotent-report-1234');
        await expect(setDoc(ref, validReport)).rejects.toThrow();
        await expect(setDoc(ref, { ...validReport, waitTime: 90 })).rejects.toThrow();
      });

      it('keeps anonymous reports publicly readable', async () => {
        await seedDoc('waitTimeReports/public-report-1234', validReport);
        const ctx = unauthenticatedContext(testEnv);
        const snapshot = await getDoc(doc(ctx.firestore(), 'waitTimeReports/public-report-1234'));
        expect(snapshot.data()).toEqual(expect.objectContaining({
          ...validReport,
          reportedAt: expect.anything(),
        }));
      });

      it('denies public reads of legacy reports containing account identifiers', async () => {
        await seedDoc('waitTimeReports/legacy-private-report', {
          ...validReport,
          userId: 'stable-user-id',
          email: 'person@example.com',
        });
        const ctx = unauthenticatedContext(testEnv);
        await expect(getDoc(
          doc(ctx.firestore(), 'waitTimeReports/legacy-private-report'),
        )).rejects.toThrow();
      });

      it.each([
        ['uid', { uid: 'stable-user-id' }],
        ['userId', { userId: 'stable-user-id' }],
        ['email', { email: 'person@example.com' }],
        ['accountId', { accountId: 'account-1' }],
        ['unknown field', { source: 'client' }],
      ])('denies public reads when schema-v1 contains %s', async (_label, extra) => {
        const path = `waitTimeReports/private-${Object.keys(extra)[0]}`;
        await seedDoc(path, { ...validReport, ...extra });
        const ctx = unauthenticatedContext(testEnv);
        await expect(getDoc(doc(ctx.firestore(), path))).rejects.toThrow();
      });

      it.each([
        ['missing status', { ...validReport, status: undefined }],
        ['fractional wait', { ...validReport, waitTime: 12.5 }],
        ['one-minute wait', { ...validReport, waitTime: 1 }],
        ['over maximum', { ...validReport, waitTime: 181 }],
        ['wrong status', { ...validReport, status: 'private' }],
      ])('denies public reads for invalid anonymous schema: %s', async (_label, report) => {
        const cleanReport = Object.fromEntries(
          Object.entries(report).filter(([, value]) => value !== undefined),
        );
        const path = `waitTimeReports/invalid-${_label.replaceAll(' ', '-')}`;
        await seedDoc(path, cleanReport);
        const ctx = unauthenticatedContext(testEnv);
        await expect(getDoc(doc(ctx.firestore(), path))).rejects.toThrow();
      });

      it('denies collection queries so unsafe legacy documents cannot be filtered into public access', async () => {
        await seedDoc('waitTimeReports/public-query-report', validReport);
        await seedDoc('waitTimeReports/legacy-query-report', {
          ...validReport,
          schemaVersion: 0,
          userId: 'legacy-user',
        });
        const ctx = unauthenticatedContext(testEnv);
        const reports = query(
          collection(ctx.firestore(), 'waitTimeReports'),
          where('schemaVersion', '==', 1),
          where('attractionId', '==', 'space-mountain'),
          orderBy('reportedAt', 'desc'),
        );
        await expect(getDocs(reports)).rejects.toThrow();
      });

      it.each([
        'queueReportRateLimits/account-hash',
        'queueReportRequests/report-request-1234',
        'queueReportContributions/contributor-hash',
      ])('keeps private queue-report state inaccessible at %s', async (path) => {
        await seedDoc(path, { uidHash: 'private', requestId: 'report-request-1234' });
        const ctx = authenticatedContext(testEnv, 'user-1');
        await expect(getDoc(doc(ctx.firestore(), path))).rejects.toThrow();
        await expect(setDoc(doc(ctx.firestore(), path), { changed: true })).rejects.toThrow();
      });
  });

  it('denies unauthenticated reads', async () => {
    await seedDoc(verPath, verData);
    const ctx = unauthenticatedContext(testEnv);
    const ref = doc(ctx.firestore(), verPath);
    await expect(getDoc(ref)).rejects.toThrow();
  });

  it('denies authenticated client creation', async () => {
    const ctx = authenticatedContext(testEnv, userId);
    const ref = doc(ctx.firestore(), verPath);
    await expect(setDoc(ref, verData)).rejects.toThrow();
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
