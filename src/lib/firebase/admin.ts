import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { initializeFirestore, getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';

const initializationStartedAt = performance.now();

export interface ServiceAccountConfig {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  token_uri?: string;
  [key: string]: unknown;
}

export function getAdminServiceAccount(): ServiceAccountConfig {
  // Try env var first (JSON string)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  // Fall back to service-account.json at project root
  const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    const raw = fs.readFileSync(serviceAccountPath, 'utf-8');
    return JSON.parse(raw);
  }

  throw new Error(
    'Firebase service account not found. Set FIREBASE_SERVICE_ACCOUNT env var or place service-account.json in project root.'
  );
}

let adminApp: App;

if (getApps().length === 0) {
  const serviceAccount = getAdminServiceAccount();
  adminApp = initializeApp({
    credential: cert(serviceAccount as Parameters<typeof cert>[0]),
    ...(serviceAccount.project_id ? { projectId: serviceAccount.project_id } : {}),
  });
} else {
  adminApp = getApps()[0];
}

// Serverless cold starts pay for gRPC channel/stream setup on the first
// Firestore call. `preferRest: true` makes the Admin SDK use plain HTTP/1.1
// REST instead, which was evidence-backed (production 504 investigation) as
// a meaningfully faster path for a cold container's first Firestore touch.
// `initializeFirestore` throws if a Firestore instance already exists for
// this app (e.g. a module re-import in tests, or hot reload in dev), so fall
// back to the existing instance rather than crashing module load.
let adminDbInstance: Firestore;
try {
  adminDbInstance = initializeFirestore(adminApp, { preferRest: true });
} catch {
  adminDbInstance = getFirestore(adminApp);
}

export const adminDb: Firestore = adminDbInstance;
export const adminProjectId = adminApp.options.projectId
  ?? process.env.GCLOUD_PROJECT
  ?? process.env.GOOGLE_CLOUD_PROJECT;
export const adminInitializationMs = Math.round(performance.now() - initializationStartedAt);
export { adminApp };
