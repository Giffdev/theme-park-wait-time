import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import path from 'node:path';
import { deleteApp, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PROJECT_ID = 'demo-theme-park-wait-times';
const SERVER_PORT = 3217;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_REQUEST_BUDGET_MS = 10_000;
const runWithEmulators = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST,
);

const adminApp = getApps().some((candidate) => candidate.name === 'queue-report-http-integration')
  ? getApp('queue-report-http-integration')
  : initializeApp({ projectId: PROJECT_ID }, 'queue-report-http-integration');
const adminDb = getFirestore(adminApp);

let server: ChildProcessWithoutNullStreams | null = null;
let serverOutput = '';
let idToken = '';
let uid = '';

function serviceAccountJson(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return JSON.stringify({
    project_id: PROJECT_ID,
    client_email: `queue-report-http@${PROJECT_ID}.iam.gserviceaccount.com`,
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    token_uri: 'https://oauth2.googleapis.com/token',
  });
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server?.exitCode != null) {
      throw new Error(`Next server exited during startup:\n${serverOutput.slice(-4_000)}`);
    }
    try {
      const response = await fetch(
        `${SERVER_URL}/api/queue-report?attractionId=startup-probe&limit=1`,
      );
      if (response.status < 500) return;
    } catch {
      // The listener is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next server did not become ready:\n${serverOutput.slice(-4_000)}`);
}

async function stopServer(): Promise<void> {
  if (!server || server.exitCode != null) return;
  const exited = new Promise<void>((resolve) => {
    server!.once('exit', () => resolve());
  });
  server.kill('SIGTERM');
  await Promise.race([
    exited,
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode == null) {
    server.kill('SIGKILL');
    await exited;
  }
}

async function createEmulatorToken(): Promise<{ idToken: string; uid: string }> {
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`
      + '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `queue-report-${Date.now()}@example.test`,
        password: 'integration-password',
        returnSecureToken: true,
      }),
    },
  );
  const body = await response.json() as { idToken?: string; localId?: string };
  if (!response.ok || !body.idToken || !body.localId) {
    throw new Error('Auth Emulator did not issue an ID token');
  }
  return { idToken: body.idToken, uid: body.localId };
}

describe.skipIf(!runWithEmulators)('queue-report production-compatible HTTP route', () => {
  beforeAll(async () => {
    const nextCli = path.resolve('node_modules', 'next', 'dist', 'bin', 'next');
    server = spawn(process.execPath, [nextCli, 'dev', '-p', String(SERVER_PORT)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'development',
        FIREBASE_SERVICE_ACCOUNT: serviceAccountJson(),
      },
      stdio: 'pipe',
      windowsHide: true,
    });
    const recordOutput = (chunk: Buffer) => {
      serverOutput = `${serverOutput}${chunk.toString()}`.slice(-8_000);
    };
    server.stdout.on('data', recordOutput);
    server.stderr.on('data', recordOutput);
    await waitForServer();
    ({ idToken, uid } = await createEmulatorToken());
  }, 90_000);

  beforeEach(async () => {
    await Promise.all([
      adminDb.recursiveDelete(adminDb.collection('attractions')),
      adminDb.recursiveDelete(adminDb.collection('queueReportRateLimits')),
      adminDb.recursiveDelete(adminDb.collection('queueReportRequests')),
      adminDb.recursiveDelete(adminDb.collection('queueReportContributions')),
      adminDb.recursiveDelete(adminDb.collection('waitTimeReports')),
      adminDb.recursiveDelete(adminDb.collection('crowdsourcedWaitTimes')),
      adminDb.recursiveDelete(adminDb.collection('users')),
    ]);
    await adminDb.doc('attractions/http-attraction').set({
      parkId: 'http-park',
      name: 'HTTP Attraction',
      entityType: 'ATTRACTION',
    });
  });

  afterAll(async () => {
    await stopServer();
    await deleteApp(adminApp);
  }, 15_000);

  it('persists trip, ride, report, and stable replay within the client budget', async () => {
    const reportedAtMs = Date.now();
    const authorization = { Authorization: `Bearer ${idToken}` };
    const tripId = 'http-route-trip-request';
    const rideId = 'http-route-report-request';
    const tripResponse = await fetch(`${SERVER_URL}/api/trip-commands`, {
      method: 'POST',
      headers: {
        ...authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requestId: tripId,
        name: 'HTTP Persistence Trip',
        startDate: '2026-08-21',
        endDate: '2026-08-21',
        parkIds: ['http-park'],
        parkNames: { 'http-park': 'HTTP Park' },
        status: 'active',
        shareId: null,
        notes: '',
      }),
    });
    expect(tripResponse.status).toBe(200);

    const rideResponse = await fetch(`${SERVER_URL}/api/ride-logs`, {
      method: 'POST',
      headers: {
        ...authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requestId: rideId,
        parkId: 'http-park',
        attractionId: 'http-attraction',
        parkName: 'HTTP Park',
        attractionName: 'HTTP Attraction',
        rodeAt: new Date(reportedAtMs).toISOString(),
        waitTimeMinutes: 35,
        attractionClosed: false,
        source: 'timer',
        rating: null,
        notes: '',
        tripId,
      }),
    });
    expect(rideResponse.status).toBe(200);

    const payload = {
      requestId: rideId,
      parkId: 'http-park',
      attractionId: 'http-attraction',
      attractionName: 'HTTP Attraction',
      waitTimeMinutes: 35,
      reportedAtMs,
    };
    const submit = () => fetch(`${SERVER_URL}/api/queue-report`, {
      method: 'POST',
      headers: {
        ...authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const startedAt = performance.now();
    const first = await submit();
    const firstDurationMs = performance.now() - startedAt;
    const replay = await submit();
    console.info(`[queue-report-http] first response ${Math.round(firstDurationMs)}ms`);

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      success: true,
      requestId: payload.requestId,
      outcome: 'accepted',
    });
    expect(firstDurationMs).toBeLessThan(CLIENT_REQUEST_BUDGET_MS);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({
      success: true,
      requestId: payload.requestId,
      outcome: 'replay',
    });

    const [trip, ride, reports, requests, contributions, budgets] = await Promise.all([
      adminDb.doc(`users/${uid}/trips/${tripId}`).get(),
      adminDb.doc(`users/${uid}/rideLogs/${rideId}`).get(),
      adminDb.collection('waitTimeReports').get(),
      adminDb.collection('queueReportRequests').get(),
      adminDb.collection('queueReportContributions').get(),
      adminDb.collection('queueReportRateLimits').get(),
    ]);
    expect(trip.data()).toEqual(expect.objectContaining({
      name: 'HTTP Persistence Trip',
      status: 'active',
    }));
    expect(ride.data()).toEqual(expect.objectContaining({
      tripId,
      clientRequestId: rideId,
      attractionId: 'http-attraction',
      waitTimeMinutes: 35,
    }));
    expect(reports.size).toBe(1);
    expect(requests.size).toBe(1);
    expect(contributions.size).toBe(1);
    expect(budgets.size).toBe(1);
    expect(budgets.docs[0].data().recentRequests).toHaveLength(1);
  });
});
