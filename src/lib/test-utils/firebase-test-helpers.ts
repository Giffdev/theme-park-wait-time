/**
 * Firebase Emulator test helpers.
 *
 * These utilities connect to the local Firebase Emulator Suite so tests
 * never touch production data.
 */
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
  type RulesTestContext,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Emulator ports — keep in sync with firebase.json
// ---------------------------------------------------------------------------
export const EMULATOR_CONFIG = {
  firestorePort: 8080,
  authPort: 9099,
  projectId: 'theme-park-wait-times-test',
} as const;

// ---------------------------------------------------------------------------
// Rules test environment helpers
// ---------------------------------------------------------------------------
let testEnv: RulesTestEnvironment | null = null;

/**
 * Initialise a @firebase/rules-unit-testing environment.
 * Reads `firestore.rules` from the project root so the emulator enforces
 * the same rules as production.
 */
export async function getTestEnv(): Promise<RulesTestEnvironment> {
  if (testEnv) return testEnv;

  const rulesPath = resolve(process.cwd(), 'firestore.rules');
  let rules: string;
  try {
    rules = readFileSync(rulesPath, 'utf-8');
  } catch {
    throw new Error(
      `Could not read firestore.rules at ${rulesPath}. ` +
        'Make sure you run tests from the project root.',
    );
  }

  testEnv = await initializeTestEnvironment({
    projectId: EMULATOR_CONFIG.projectId,
    firestore: {
      rules,
      host: '127.0.0.1',
      port: EMULATOR_CONFIG.firestorePort,
    },
  });

  return testEnv;
}

/**
 * Return a Firestore client authenticated as the given uid.
 */
export function authenticatedContext(
  env: RulesTestEnvironment,
  uid: string,
  tokenOverrides?: Record<string, unknown>,
): RulesTestContext {
  return env.authenticatedContext(uid, tokenOverrides);
}

/**
 * Return an unauthenticated Firestore client.
 */
export function unauthenticatedContext(
  env: RulesTestEnvironment,
): RulesTestContext {
  return env.unauthenticatedContext();
}

/**
 * Wipe all Firestore data in the emulator — call in beforeEach/afterEach.
 */
export async function clearFirestoreData(
  env: RulesTestEnvironment,
): Promise<void> {
  await env.clearFirestore();
}

/**
 * Tear down the test environment — call in afterAll.
 */
export async function cleanupTestEnv(): Promise<void> {
  if (testEnv) {
    await testEnv.cleanup();
    testEnv = null;
  }
}
