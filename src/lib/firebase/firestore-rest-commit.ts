import { createPrivateKey, createSign } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import {
  adminProjectId,
  getAdminServiceAccount,
  type ServiceAccountConfig,
} from '@/lib/firebase/admin';

export const FIRESTORE_REST_COMMIT_ABORT_MS = 7_000;
export const FIRESTORE_REST_READ_ABORT_MS = 5_000;
export const FIRESTORE_ACCESS_TOKEN_DEADLINE_MS = 2_000;
const MAX_ERROR_RESPONSE_BYTES = 16_384;
const MAX_READ_RESPONSE_BYTES = 64 * 1024 * 1024;
const DEFAULT_QUERY_TOTAL_BYTES = 8 * 1024 * 1024;
const DEFAULT_QUERY_MAX_DOCUMENTS = 10_000;
const DEFAULT_QUERY_PAGE_SIZE = 10;
export const QUERY_REPRESENTATION_MULTIPLIER = 8;
const OAUTH_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const FIRESTORE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/datastore';
const TOKEN_EXPIRY_SKEW_MS = 60_000;

export type FirestoreRestValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number | string }
  | { timestampValue: string }
  | { stringValue: string }
  | { bytesValue: string }
  | { arrayValue: { values?: FirestoreRestValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreRestValue> } };

export interface FirestoreCommitDocument {
  path: string;
  fields: Record<string, unknown>;
  serverTimestampFields?: string[];
  operation?: 'create' | 'update';
  updateMaskFields?: string[];
}

export interface FirestoreCommitWriteResult {
  path: string;
  transformResults: Record<string, string>;
}

export interface FirestoreCommitResult {
  commitTime: string | null;
  writes: FirestoreCommitWriteResult[];
}

export interface FirestoreRestCommitDependencies {
  fetch?: typeof fetch;
  tokenFetch?: typeof fetch;
  serviceAccount?: ServiceAccountConfig;
  projectId?: string;
  emulatorHost?: string | null;
  commitAbortMs?: number;
  readAbortMs?: number;
  accessTokenDeadlineMs?: number;
  allowCustomTokenUri?: boolean;
  now?: () => number;
  deadlineAt?: number;
  accessTokenProvider?: () => Promise<string>;
}

export interface FirestoreReadDocument {
  path: string;
  fields: Record<string, unknown>;
}

export interface FirestoreEqualityQuery {
  collectionPath: string;
  field: string;
  value: unknown;
  projectionFields?: string[];
  orderBy?: Array<{
    field: string;
    direction: 'ASCENDING' | 'DESCENDING';
  }>;
  startAfter?: {
    values: unknown[];
    documentPath: string;
  };
  limit?: number;
  pageSize?: number;
  transaction?: string;
  onDocument?: (document: FirestoreReadDocument) => void;
  /** Conservative total budget for wire, text, parsed, decoded, and accumulated representations. */
  maxRepresentationBytes?: number;
  /** @deprecated Use maxRepresentationBytes. */
  maxDecodedBytes?: number;
  maxDocuments?: number;
}

export class FirestoreRestCommitError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'FirestoreRestCommitError';
  }
}

function encodeDouble(value: number): number | string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  return value;
}

function encodeTimestamp(value: Timestamp): string {
  const wholeSecond = new Date(value.seconds * 1_000).toISOString().replace('.000Z', '');
  if (value.nanoseconds === 0) return `${wholeSecond}Z`;
  const fraction = String(value.nanoseconds).padStart(9, '0').replace(/0+$/, '');
  return `${wholeSecond}.${fraction}Z`;
}

export function encodeFirestoreRestValue(value: unknown): FirestoreRestValue {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      if (!Number.isSafeInteger(value)) {
        throw new FirestoreRestCommitError(
          'INVALID_ARGUMENT',
          'Unsafe JavaScript integers cannot be persisted without precision loss.',
        );
      }
      return { integerValue: String(value) };
    }
    return { doubleValue: encodeDouble(value) };
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new FirestoreRestCommitError('INVALID_ARGUMENT', 'Invalid Date value.');
    }
    return { timestampValue: value.toISOString() };
  }
  if (value instanceof Timestamp) {
    return { timestampValue: encodeTimestamp(value) };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { bytesValue: Buffer.from(value).toString('base64') };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: value.length
        ? { values: value.map((item) => encodeFirestoreRestValue(item)) }
        : {},
    };
  }
  if (value && typeof value === 'object') {
    const fields = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encodeFirestoreRestValue(item)]),
    );
    return { mapValue: Object.keys(fields).length ? { fields } : {} };
  }
  throw new FirestoreRestCommitError(
    'INVALID_ARGUMENT',
    `Unsupported Firestore value type: ${typeof value}.`,
  );
}

function validateDocumentPath(path: string): string {
  const segments = path.split('/');
  if (segments.length < 2 || segments.length % 2 !== 0 || segments.some((segment) => !segment)) {
    throw new FirestoreRestCommitError('INVALID_ARGUMENT', 'Invalid Firestore document path.');
  }
  return path;
}

function fieldPath(value: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return value;
  return `\`${value.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\``;
}

function isRfc3339Timestamp(value: unknown): value is string {
  if (typeof value !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const dateParts = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
  );
  if (!dateParts) return false;
  const [, year, month, day, hour, minute, second] = dateParts;
  return Number(month) >= 1 && Number(month) <= 12
    && Number(day) >= 1
    && Number(day) <= new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
    && Number(hour) <= 23
    && Number(minute) <= 59
    && Number(second) <= 59;
}

function buildWrites(projectId: string, documents: FirestoreCommitDocument[]) {
  if (!documents.length) {
    throw new FirestoreRestCommitError('INVALID_ARGUMENT', 'A commit requires at least one write.');
  }
  return documents.map((document) => {
    const fields = Object.fromEntries(
      Object.entries(document.fields).map(([key, value]) => [
        key,
        encodeFirestoreRestValue(value),
      ]),
    );
    return {
      update: {
        name: `projects/${projectId}/databases/(default)/documents/${validateDocumentPath(document.path)}`,
        fields,
      },
      currentDocument: { exists: document.operation === 'update' },
      ...(document.updateMaskFields?.length
        ? { updateMask: { fieldPaths: document.updateMaskFields.map(fieldPath) } }
        : {}),
      ...(document.serverTimestampFields?.length
        ? {
            updateTransforms: document.serverTimestampFields.map((name) => ({
              fieldPath: fieldPath(name),
              setToServerValue: 'REQUEST_TIME',
            })),
          }
        : {}),
    };
  });
}

function remainingStageMs(
  dependencies: FirestoreRestCommitDependencies,
  stageMaximum: number,
): number {
  if (dependencies.deadlineAt === undefined) return stageMaximum;
  const remaining = dependencies.deadlineAt - (dependencies.now ?? Date.now)();
  if (remaining <= 0) {
    throw new FirestoreRestCommitError(
      'DEADLINE_EXCEEDED',
      'The overall save deadline elapsed before the next Firestore stage.',
    );
  }
  return Math.max(1, Math.min(stageMaximum, remaining));
}

async function readBoundedError(response: Response, signal?: AbortSignal): Promise<unknown> {
  try {
    return await readBoundedJson(response, MAX_ERROR_RESPONSE_BYTES, signal);
  } catch (error) {
    if (error instanceof FirestoreRestCommitError
        && error.code === 'RESOURCE_EXHAUSTED') return null;
    throw error;
  }
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new FirestoreRestCommitError(
          'RESOURCE_EXHAUSTED',
          'Firestore REST response exceeded the local size limit.',
        );
      }

      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : null;
  } catch (error) {
    if (error instanceof FirestoreRestCommitError) throw error;
    if (signal?.aborted) throw error;
    return null;
  }
}

async function readBoundedJsonWithSize(
  response: Response,
  maximumBytes: number,
  signal?: AbortSignal,
): Promise<{ value: unknown; bytes: number }> {
  if (!response.body) return { value: null, bytes: 0 };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new FirestoreRestCommitError(
          'RESOURCE_EXHAUSTED',
          'Firestore REST response exceeded the configured representation budget.',
        );
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks, bytes).toString('utf8');
    return { value: text ? JSON.parse(text) : null, bytes };
  } catch (error) {
    if (error instanceof FirestoreRestCommitError) throw error;
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw error;
    }
    throw new FirestoreRestCommitError(
      'DATA_LOSS',
      'Firestore REST response was not valid JSON.',
      undefined,
      { cause: error },
    );
  }
}

function canonicalErrorCode(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: unknown }).error;
    if (error && typeof error === 'object' && 'status' in error
        && typeof (error as { status?: unknown }).status === 'string') {
      const canonicalStatus = (error as { status: string }).status;
      if (/^[A-Z][A-Z0-9_]+$/.test(canonicalStatus)) return canonicalStatus;
    }
  }
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'PERMISSION_DENIED';
  if (status === 429) return 'RESOURCE_EXHAUSTED';
  if (status === 400) return 'INVALID_ARGUMENT';
  if (status === 504) return 'DEADLINE_EXCEEDED';
  if (status >= 500) return 'UNAVAILABLE';
  return `HTTP_${status}`;
}

interface CachedAccessToken {
  accessToken: string;
  expiresAtMs: number;
}

export interface ServiceAccountAccessTokenProviderOptions {
  fetch?: typeof fetch;
  deadlineMs?: number;
  now?: () => number;
  allowCustomTokenUri?: boolean;
  deadlineAt?: number;
}

function requireServiceAccountCredentials(serviceAccount: ServiceAccountConfig): {
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
} {
  requireProjectId(serviceAccount.project_id);
  const clientEmail = serviceAccount.client_email;
  const privateKey = serviceAccount.private_key;
  const tokenUri = serviceAccount.token_uri;
  if (typeof clientEmail !== 'string'
      || !/^[^@\s]+@[^@\s]+$/.test(clientEmail)
      || typeof privateKey !== 'string'
      || !privateKey
      || typeof tokenUri !== 'string'
      || !tokenUri) {
    throw new FirestoreRestCommitError(
      'FAILED_PRECONDITION',
      'Firebase service-account OAuth credentials are not configured.',
    );
  }
  let parsedTokenUri: URL;
  try {
    parsedTokenUri = new URL(tokenUri);
  } catch {
    throw new FirestoreRestCommitError(
      'FAILED_PRECONDITION',
      'Firebase service-account token URI is invalid.',
    );
  }
  if (parsedTokenUri.protocol !== 'https:') {
    throw new FirestoreRestCommitError(
      'FAILED_PRECONDITION',
      'Firebase service-account token URI must use HTTPS.',
    );
  }
  try {
    const key = createPrivateKey({ key: privateKey, format: 'pem' });
    if (key.asymmetricKeyType !== 'rsa') throw new Error('not RSA');
  } catch {
    throw new FirestoreRestCommitError(
      'FAILED_PRECONDITION',
      'Firebase service-account private key is invalid.',
    );
  }
  return { clientEmail, privateKey, tokenUri: parsedTokenUri.toString() };
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createServiceAccountAssertion(
  clientEmail: string,
  privateKey: string,
  tokenUri: string,
  nowMs: number,
): string {
  const issuedAt = Math.floor(nowMs / 1_000);
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = base64UrlJson({
    iss: clientEmail,
    sub: clientEmail,
    aud: tokenUri,
    scope: FIRESTORE_OAUTH_SCOPE,
    iat: issuedAt,
    exp: issuedAt + 3_600,
  });
  const unsignedAssertion = `${header}.${claims}`;
  const signature = createSign('RSA-SHA256')
    .update(unsignedAssertion)
    .end()
    .sign(privateKey)
    .toString('base64url');
  return `${unsignedAssertion}.${signature}`;
}

export function createServiceAccountAccessTokenProvider(
  serviceAccount: ServiceAccountConfig,
  options: ServiceAccountAccessTokenProviderOptions = {},
): () => Promise<string> {
  const credentials = requireServiceAccountCredentials(serviceAccount);
  const customTokenUriAllowed = options.allowCustomTokenUri === true
    && process.env.NODE_ENV !== 'production';
  if (credentials.tokenUri !== OAUTH_TOKEN_URI && !customTokenUriAllowed) {
    throw new FirestoreRestCommitError(
      'FAILED_PRECONDITION',
      'Firebase service-account token URI is not allowed.',
    );
  }
  const fetchImplementation = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const deadlineMs = options.deadlineMs ?? FIRESTORE_ACCESS_TOKEN_DEADLINE_MS;
  let cachedToken: CachedAccessToken | null = null;
  let inFlight: Promise<CachedAccessToken> | null = null;

  const acquireToken = async (): Promise<CachedAccessToken> => {
    const controller = new AbortController();
    const remaining = options.deadlineAt === undefined
      ? deadlineMs
      : Math.min(deadlineMs, options.deadlineAt - now());
    if (remaining <= 0) {
      throw new FirestoreRestCommitError(
        'DEADLINE_EXCEEDED',
        'The overall save deadline elapsed before OAuth token acquisition.',
      );
    }
    const abortTimer = setTimeout(() => controller.abort(), remaining);
    try {
      const assertion = createServiceAccountAssertion(
        credentials.clientEmail,
        credentials.privateKey,
        credentials.tokenUri,
        now(),
      );
      const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      });
      const response = await fetchImplementation(credentials.tokenUri, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
      const responseBody = await readBoundedError(response, controller.signal);
      if (!response.ok) {
        const code = response.status >= 400 && response.status < 500 && response.status !== 429
          ? 'FAILED_PRECONDITION'
          : canonicalErrorCode(response.status, responseBody);
        throw new FirestoreRestCommitError(
          code,
          'Firebase OAuth token request failed.',
          response.status,
        );
      }
      const tokenResponse = responseBody && typeof responseBody === 'object'
        ? responseBody as { access_token?: unknown; expires_in?: unknown }
        : {};
      if (typeof tokenResponse.access_token !== 'string' || !tokenResponse.access_token
          || typeof tokenResponse.expires_in !== 'number'
          || !Number.isFinite(tokenResponse.expires_in)
          || tokenResponse.expires_in <= 0) {
        throw new FirestoreRestCommitError(
          'FAILED_PRECONDITION',
          'Firebase OAuth token response was invalid.',
        );
      }
      return {
        accessToken: tokenResponse.access_token,
        expiresAtMs: now() + tokenResponse.expires_in * 1_000,
      };
    } catch (error) {
      if (error instanceof FirestoreRestCommitError) throw error;
      if (controller.signal.aborted
          || (error instanceof Error && error.name === 'AbortError')) {
        throw new FirestoreRestCommitError(
          'DEADLINE_EXCEEDED',
          'Firebase OAuth token request was aborted at its deadline.',
          undefined,
          { cause: error },
        );
      }
      throw new FirestoreRestCommitError(
        'UNAVAILABLE',
        'Firebase OAuth token transport failed.',
        undefined,
        { cause: error },
      );
    } finally {
      clearTimeout(abortTimer);
    }
  };

  return async () => {
    const currentTime = now();
    if (cachedToken && cachedToken.expiresAtMs - TOKEN_EXPIRY_SKEW_MS > currentTime) {
      return cachedToken.accessToken;
    }
    if (!inFlight) {
      inFlight = acquireToken();
    }
    const operation = inFlight;
    try {
      cachedToken = await operation;
      return cachedToken.accessToken;
    } finally {
      if (inFlight === operation) inFlight = null;
    }
  };
}

let defaultAccessTokenProvider: (() => Promise<string>) | null = null;

function getDefaultAccessTokenProvider(): () => Promise<string> {
  if (!defaultAccessTokenProvider) {
    defaultAccessTokenProvider = createServiceAccountAccessTokenProvider(
      getAdminServiceAccount(),
    );
  }
  return defaultAccessTokenProvider;
}

function requireProjectId(projectId: unknown): string {
  if (typeof projectId !== 'string'
      || !/^[a-z][a-z0-9-]{4,62}$/.test(projectId)
      || projectId.endsWith('-')) {
    throw new FirestoreRestCommitError(
      'FAILED_PRECONDITION',
      'Firebase project ID is not configured correctly.',
    );
  }
  return projectId;
}

function firestoreEndpoint(
  projectId: string,
  emulatorHost: string | null,
  suffix: string,
): string {
  const endpointBase = emulatorHost
    ? `http://${emulatorHost}`
    : 'https://firestore.googleapis.com';
  return `${endpointBase}/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents${suffix}`;
}

export function encodeFirestoreUrlPath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function documentName(projectId: string, path: string): string {
  return `projects/${projectId}/databases/(default)/documents/${validateDocumentPath(path)}`;
}

export async function beginFirestoreTransaction(
  dependencies: FirestoreRestCommitDependencies = {},
): Promise<string> {
  const configuredProjectId = Object.prototype.hasOwnProperty.call(dependencies, 'projectId')
    ? dependencies.projectId
    : adminProjectId;
  const projectId = requireProjectId(configuredProjectId);
  const emulatorHost = dependencies.emulatorHost === undefined
    ? process.env.FIRESTORE_EMULATOR_HOST ?? null
    : dependencies.emulatorHost;
  const headers = {
    'content-type': 'application/json',
    ...await getAuthorizationHeaders(dependencies, emulatorHost),
  };
  const controller = new AbortController();
  const abortTimer = setTimeout(
    () => controller.abort(),
    remainingStageMs(
      dependencies,
      dependencies.readAbortMs ?? FIRESTORE_REST_READ_ABORT_MS,
    ),
  );
  try {
    const response = await (dependencies.fetch ?? fetch)(
      firestoreEndpoint(projectId, emulatorHost, ':beginTransaction'),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ options: { readWrite: {} } }),
        signal: controller.signal,
      },
    );
    const body = await readBoundedJson(response, MAX_ERROR_RESPONSE_BYTES, controller.signal);
    if (!response.ok) {
      throw new FirestoreRestCommitError(
        canonicalErrorCode(response.status, body),
        'Firestore REST beginTransaction failed.',
        response.status,
      );
    }

    const transaction = body && typeof body === 'object'
      ? (body as { transaction?: unknown }).transaction
      : null;
    if (typeof transaction !== 'string' || !transaction) {
      throw new FirestoreRestCommitError(
        'DATA_LOSS',
        'Firestore beginTransaction response was invalid.',
      );
    }
    return transaction;
  } catch (error) {
    if (error instanceof FirestoreRestCommitError) throw error;
    if (controller.signal.aborted
        || (error instanceof Error && error.name === 'AbortError')) {
      throw new FirestoreRestCommitError(
        'DEADLINE_EXCEEDED',
        'Firestore REST beginTransaction was aborted at its deadline.',
        undefined,
        { cause: error },
      );
    }
    throw new FirestoreRestCommitError(
      'UNAVAILABLE',
      'Firestore REST beginTransaction transport failed.',
      undefined,
      { cause: error },
    );
  } finally {
    clearTimeout(abortTimer);
  }
}

export async function rollbackFirestoreTransaction(
  transaction: string,
  dependencies: FirestoreRestCommitDependencies = {},
): Promise<void> {
  if (!transaction) {
    throw new FirestoreRestCommitError('INVALID_ARGUMENT', 'Missing Firestore transaction.');
  }
  const configuredProjectId = Object.prototype.hasOwnProperty.call(dependencies, 'projectId')
    ? dependencies.projectId
    : adminProjectId;
  const projectId = requireProjectId(configuredProjectId);
  const emulatorHost = dependencies.emulatorHost === undefined
    ? process.env.FIRESTORE_EMULATOR_HOST ?? null
    : dependencies.emulatorHost;
  const headers = {
    'content-type': 'application/json',
    ...await getAuthorizationHeaders(dependencies, emulatorHost),
  };
  const controller = new AbortController();
  const abortTimer = setTimeout(
    () => controller.abort(),
    remainingStageMs(
      dependencies,
      dependencies.readAbortMs ?? FIRESTORE_REST_READ_ABORT_MS,
    ),
  );
  try {
    const response = await (dependencies.fetch ?? fetch)(
      firestoreEndpoint(projectId, emulatorHost, ':rollback'),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ transaction }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const body = await readBoundedError(response, controller.signal);
      throw new FirestoreRestCommitError(
        canonicalErrorCode(response.status, body),
        'Firestore REST rollback failed.',
        response.status,
      );
    }
  } catch (error) {
    if (error instanceof FirestoreRestCommitError) throw error;
    if (controller.signal.aborted
        || (error instanceof Error && error.name === 'AbortError')) {
      throw new FirestoreRestCommitError(
        'DEADLINE_EXCEEDED',
        'Firestore REST rollback was aborted at its deadline.',
        undefined,
        { cause: error },
      );
    }
    throw new FirestoreRestCommitError(
      'UNAVAILABLE',
      'Firestore REST rollback transport failed.',
      undefined,
      { cause: error },
    );
  } finally {
    clearTimeout(abortTimer);
  }
}

function validateCollectionPath(path: string): { parent: string; collectionId: string } {
  const segments = path.split('/');
  if (segments.length < 1 || segments.length % 2 === 0 || segments.some((segment) => !segment)) {
    throw new FirestoreRestCommitError('INVALID_ARGUMENT', 'Invalid Firestore collection path.');
  }
  return {
    parent: segments.slice(0, -1).join('/'),
    collectionId: segments.at(-1)!,
  };
}

export async function runFirestoreEqualityQuery(
  query: FirestoreEqualityQuery,
  dependencies: FirestoreRestCommitDependencies = {},
): Promise<{
  documents: FirestoreReadDocument[];
  readTime: string | null;
}> {
  const configuredProjectId = Object.prototype.hasOwnProperty.call(dependencies, 'projectId')
    ? dependencies.projectId
    : adminProjectId;
  const projectId = requireProjectId(configuredProjectId);
  const emulatorHost = dependencies.emulatorHost === undefined
    ? process.env.FIRESTORE_EMULATOR_HOST ?? null
    : dependencies.emulatorHost;
  const { parent, collectionId } = validateCollectionPath(query.collectionPath);
  const headers = {
    'content-type': 'application/json',
    ...await getAuthorizationHeaders(dependencies, emulatorHost),
  };
  const pageSize = query.pageSize ?? DEFAULT_QUERY_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1_000) {
    throw new FirestoreRestCommitError('INVALID_ARGUMENT', 'Invalid Firestore query page size.');
  }
  if (query.projectionFields?.some((field) => !field)) {
    throw new FirestoreRestCommitError('INVALID_ARGUMENT', 'Invalid Firestore projection.');
  }
  const orderBy = query.orderBy ?? [
    { field: '__name__', direction: 'ASCENDING' as const },
  ];
  if (!orderBy.length || orderBy.some(({ field, direction }) => (
    !field || (direction !== 'ASCENDING' && direction !== 'DESCENDING')
  ))) {
    throw new FirestoreRestCommitError('INVALID_ARGUMENT', 'Invalid Firestore query ordering.');
  }
  if (query.startAfter) {
    validateDocumentPath(query.startAfter.documentPath);
    if (orderBy.at(-1)?.field !== '__name__'
        || query.startAfter.values.length !== orderBy.length - 1) {
      throw new FirestoreRestCommitError('INVALID_ARGUMENT', 'Invalid Firestore query cursor.');
    }
  }
  if (query.limit !== undefined
      && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 1_000)) {
    throw new FirestoreRestCommitError('INVALID_ARGUMENT', 'Invalid Firestore query limit.');
  }
  const documents: FirestoreReadDocument[] = [];
  const maxDocuments = query.maxDocuments ?? DEFAULT_QUERY_MAX_DOCUMENTS;
  const maxRepresentationBytes = query.maxRepresentationBytes
    ?? query.maxDecodedBytes
    ?? DEFAULT_QUERY_TOTAL_BYTES;
  if (!Number.isInteger(maxDocuments) || maxDocuments < 1
      || !Number.isInteger(maxRepresentationBytes) || maxRepresentationBytes < 1) {
    throw new FirestoreRestCommitError('INVALID_ARGUMENT', 'Invalid Firestore query budget.');
  }
  let documentCount = 0;
  let representationBytes = 0;
  let readTime: string | null = null;
  let startAfterName: string | null = query.startAfter
    ? documentName(projectId, query.startAfter.documentPath)
    : null;
  let startAfterValues = query.startAfter?.values.map(encodeFirestoreRestValue) ?? [];
  while (true) {
      const controller = new AbortController();
      const abortTimer = setTimeout(
        () => controller.abort(),
        remainingStageMs(
          dependencies,
          dependencies.readAbortMs ?? FIRESTORE_REST_READ_ABORT_MS,
        ),
      );
      try {
        const structuredQuery = {
          ...(query.projectionFields?.length
            ? {
                select: {
                  fields: query.projectionFields.map((field) => ({ fieldPath: field })),
                },
              }
            : {}),
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath: query.field },
              op: 'EQUAL',
              value: encodeFirestoreRestValue(query.value),
            },
          },
          orderBy: orderBy.map(({ field, direction }) => ({
            field: { fieldPath: field },
            direction,
          })),
          limit: query.limit
            ? Math.min(pageSize, query.limit - documentCount)
            : pageSize,
          ...(startAfterName
            ? {
                startAt: {
                  values: [
                    ...startAfterValues,
                    { referenceValue: startAfterName },
                  ],
                  before: false,
                },
              }
            : {}),
        };
        const encodedParent = parent ? `/${encodeFirestoreUrlPath(parent)}` : '';
        const response = await (dependencies.fetch ?? fetch)(
          firestoreEndpoint(projectId, emulatorHost, `${encodedParent}:runQuery`),
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              structuredQuery,
              ...(query.transaction ? { transaction: query.transaction } : {}),
            }),
            signal: controller.signal,
          },
        );
        const remainingRepresentationBytes = maxRepresentationBytes - representationBytes;
        if (remainingRepresentationBytes < QUERY_REPRESENTATION_MULTIPLIER) {
          throw new FirestoreRestCommitError(
            'RESOURCE_EXHAUSTED',
            'Firestore query exceeded the configured representation budget.',
          );
        }
        const page = await readBoundedJsonWithSize(
          response,
          Math.min(
            MAX_READ_RESPONSE_BYTES,
            Math.floor(remainingRepresentationBytes / QUERY_REPRESENTATION_MULTIPLIER),
          ),
          controller.signal,
        );
        representationBytes += page.bytes * QUERY_REPRESENTATION_MULTIPLIER;
        const body = page.value;
        if (!response.ok) {
          throw new FirestoreRestCommitError(
            canonicalErrorCode(response.status, body),
            'Firestore REST runQuery failed.',
            response.status,
          );
        }
        if (!Array.isArray(body)) {
          throw new FirestoreRestCommitError('DATA_LOSS', 'Firestore runQuery response was invalid.');
        }
        const prefix = `projects/${projectId}/databases/(default)/documents/`;
        const pageDocuments: FirestoreReadDocument[] = [];
        let lastDocumentName: string | null = null;
        for (const entry of body) {
          if (!entry || typeof entry !== 'object') {
            throw new FirestoreRestCommitError('DATA_LOSS', 'Firestore runQuery entry was invalid.');
          }
          const entryReadTime = (entry as { readTime?: unknown }).readTime;
          if (typeof entryReadTime === 'string') {
            if (readTime && readTime !== entryReadTime && !query.transaction) {
              throw new FirestoreRestCommitError(
                'DATA_LOSS',
                'Firestore query pages used inconsistent snapshots.',
              );
            }
            readTime = entryReadTime;
          }
          if (!('document' in entry)) continue;
          const document = (entry as {
            document?: { name?: unknown; fields?: Record<string, FirestoreRestValue> };
          }).document;
          if (!document || typeof document.name !== 'string' || !document.name.startsWith(prefix)) {
            throw new FirestoreRestCommitError('DATA_LOSS', 'Firestore runQuery document was invalid.');
          }
          lastDocumentName = document.name;
          pageDocuments.push({
            path: document.name.slice(prefix.length),
            fields: Object.fromEntries(
              Object.entries(document.fields ?? {})
                .map(([key, value]) => [key, decodeFirestoreRestValue(value)]),
            ),
          });
        }
        documentCount += pageDocuments.length;
        if (documentCount > maxDocuments) {
          throw new FirestoreRestCommitError(
            'RESOURCE_EXHAUSTED',
            'Firestore query exceeded the configured document limit.',
          );
        }
        if (query.onDocument) {
          for (const document of pageDocuments) query.onDocument(document);
        } else {
          documents.push(...pageDocuments);
        }
        if (query.limit && documentCount >= query.limit) break;
        if (pageDocuments.length < pageSize) break;
        if (orderBy.length !== 1 || orderBy[0].field !== '__name__') {
          throw new FirestoreRestCommitError(
            'INVALID_ARGUMENT',
            'Ordered Firestore queries must set a limit no larger than the page size.',
          );
        }
        if (!lastDocumentName || lastDocumentName === startAfterName) {
          throw new FirestoreRestCommitError(
            'DATA_LOSS',
            'Firestore query pagination did not advance.',
          );
        }
        startAfterName = lastDocumentName;
        startAfterValues = [];
      } catch (error) {
        if (error instanceof FirestoreRestCommitError) throw error;
        if (controller.signal.aborted
            || (error instanceof Error && error.name === 'AbortError')) {
          throw new FirestoreRestCommitError(
            'DEADLINE_EXCEEDED',
            'Firestore REST runQuery was aborted at its deadline.',
            undefined,
            { cause: error },
          );
        }
        throw new FirestoreRestCommitError(
          'UNAVAILABLE',
          'Firestore REST runQuery transport failed.',
          undefined,
          { cause: error },
        );
      } finally {
        clearTimeout(abortTimer);
      }
  }
  return { documents, readTime };
}

async function getAuthorizationHeaders(
  dependencies: FirestoreRestCommitDependencies,
  emulatorHost: string | null,
): Promise<Record<string, string>> {
  if (emulatorHost) return { authorization: ['Bearer', 'owner'].join(' ') };
  if (dependencies.accessTokenProvider) {
    return {
      authorization: ['Bearer', await dependencies.accessTokenProvider()].join(' '),
    };
  }
  const hasCustomTokenConfiguration = dependencies.serviceAccount
    || dependencies.tokenFetch
    || dependencies.accessTokenDeadlineMs !== undefined
    || dependencies.allowCustomTokenUri !== undefined
    || dependencies.now
    || dependencies.deadlineAt !== undefined;
  const getAccessToken = hasCustomTokenConfiguration
    ? createServiceAccountAccessTokenProvider(
        dependencies.serviceAccount ?? getAdminServiceAccount(),
        {
          fetch: dependencies.tokenFetch,
          deadlineMs: remainingStageMs(
            dependencies,
            dependencies.accessTokenDeadlineMs ?? FIRESTORE_ACCESS_TOKEN_DEADLINE_MS,
          ),
          now: dependencies.now,
          allowCustomTokenUri: dependencies.allowCustomTokenUri,
          deadlineAt: dependencies.deadlineAt,
        },
      )
    : getDefaultAccessTokenProvider();
  return { authorization: ['Bearer', await getAccessToken()].join(' ') };
}

export function decodeFirestoreRestValue(value: FirestoreRestValue): unknown {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) {
    const parsed = Number(value.integerValue);
    if (!Number.isSafeInteger(parsed)) {
      throw new FirestoreRestCommitError(
        'DATA_LOSS',
        'Firestore returned an integer that cannot be represented safely.',
      );
    }
    return parsed;
  }
  if ('doubleValue' in value) {
    if (value.doubleValue === 'NaN') return Number.NaN;
    if (value.doubleValue === 'Infinity') return Infinity;
    if (value.doubleValue === '-Infinity') return -Infinity;
    return value.doubleValue;
  }
  if ('timestampValue' in value) return value.timestampValue;
  if ('stringValue' in value) return value.stringValue;
  if ('bytesValue' in value) return Buffer.from(value.bytesValue, 'base64');
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map(decodeFirestoreRestValue);
  }
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {})
        .map(([key, nested]) => [key, decodeFirestoreRestValue(nested)]),
    );
  }
  throw new FirestoreRestCommitError('DATA_LOSS', 'Firestore returned an unknown value.');
}

export async function batchGetFirestoreDocuments(
  paths: string[],
  dependencies: FirestoreRestCommitDependencies = {},
  transaction?: string,
): Promise<Map<string, FirestoreReadDocument | null>> {
  if (!paths.length || new Set(paths).size !== paths.length) {
    throw new FirestoreRestCommitError(
      'INVALID_ARGUMENT',
      'Firestore batchGet requires unique document paths.',
    );
  }
  const configuredProjectId = Object.prototype.hasOwnProperty.call(dependencies, 'projectId')
    ? dependencies.projectId
    : adminProjectId;
  const projectId = requireProjectId(configuredProjectId);
  const emulatorHost = dependencies.emulatorHost === undefined
    ? process.env.FIRESTORE_EMULATOR_HOST ?? null
    : dependencies.emulatorHost;
  const expectedNames = new Map(
    paths.map((path) => [documentName(projectId, path), path]),
  );
  const headers = {
    'content-type': 'application/json',
    ...await getAuthorizationHeaders(dependencies, emulatorHost),
  };
  const controller = new AbortController();
  const abortTimer = setTimeout(
    () => controller.abort(),
    remainingStageMs(
      dependencies,
      dependencies.readAbortMs ?? FIRESTORE_REST_READ_ABORT_MS,
    ),
  );
  try {
    const response = await (dependencies.fetch ?? fetch)(
      firestoreEndpoint(projectId, emulatorHost, ':batchGet'),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          documents: [...expectedNames.keys()],
          ...(transaction ? { transaction } : {}),
        }),
        signal: controller.signal,
      },
    );
    const body = await readBoundedJson(response, MAX_READ_RESPONSE_BYTES, controller.signal);
    if (!response.ok) {
      throw new FirestoreRestCommitError(
        canonicalErrorCode(response.status, body),
        'Firestore REST batchGet failed.',
        response.status,
      );
    }
    if (!Array.isArray(body)) {
      throw new FirestoreRestCommitError('DATA_LOSS', 'Firestore batchGet response was invalid.');
    }
    const results = new Map<string, FirestoreReadDocument | null>();
    for (const entry of body) {
      if (!entry || typeof entry !== 'object') {
        throw new FirestoreRestCommitError('DATA_LOSS', 'Firestore batchGet entry was invalid.');
      }
      const record = entry as {
        found?: { name?: unknown; fields?: Record<string, FirestoreRestValue> };
        missing?: unknown;
      };
      const name = record.found?.name ?? record.missing;
      if (typeof name !== 'string' || !expectedNames.has(name)) {
        throw new FirestoreRestCommitError(
          'DATA_LOSS',
          'Firestore batchGet returned an unexpected document name.',
        );
      }
      const path = expectedNames.get(name)!;
      if (results.has(path)) {
        throw new FirestoreRestCommitError(
          'DATA_LOSS',
          'Firestore batchGet returned a duplicate document.',
        );
      }
      if (record.found) {
        const fields = Object.fromEntries(
          Object.entries(record.found.fields ?? {})
            .map(([key, value]) => [key, decodeFirestoreRestValue(value)]),
        );
        results.set(path, { path, fields });
      } else {
        results.set(path, null);
      }
    }
    if (results.size !== paths.length) {
      throw new FirestoreRestCommitError(
        'DATA_LOSS',
        'Firestore batchGet omitted a requested document.',
      );
    }
    return results;
  } catch (error) {
    if (error instanceof FirestoreRestCommitError) throw error;
    if (controller.signal.aborted
        || (error instanceof Error && error.name === 'AbortError')) {
      throw new FirestoreRestCommitError(
        'DEADLINE_EXCEEDED',
        'Firestore REST batchGet was aborted at its deadline.',
        undefined,
        { cause: error },
      );
    }
    throw new FirestoreRestCommitError(
      'UNAVAILABLE',
      'Firestore REST batchGet transport failed.',
      undefined,
      { cause: error },
    );
  } finally {
    clearTimeout(abortTimer);
  }
}

export async function commitFirestoreDocuments(
  documents: FirestoreCommitDocument[],
  dependencies: FirestoreRestCommitDependencies = {},
  transaction?: string,
): Promise<FirestoreCommitResult | null> {
  const configuredProjectId = Object.prototype.hasOwnProperty.call(dependencies, 'projectId')
    ? dependencies.projectId
    : adminProjectId;
  const projectId = requireProjectId(configuredProjectId);
  const emulatorHost = dependencies.emulatorHost === undefined
    ? process.env.FIRESTORE_EMULATOR_HOST ?? null
    : dependencies.emulatorHost;
  const endpointBase = emulatorHost
    ? `http://${emulatorHost}`
    : 'https://firestore.googleapis.com';
  const endpoint = `${endpointBase}/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...await getAuthorizationHeaders(dependencies, emulatorHost),
  };

  remainingStageMs(dependencies, Number.MAX_SAFE_INTEGER);
  const controller = new AbortController();
  const abortTimer = setTimeout(
    () => controller.abort(),
    remainingStageMs(
      dependencies,
      dependencies.commitAbortMs ?? FIRESTORE_REST_COMMIT_ABORT_MS,
    ),
  );
  try {
    const response = await (dependencies.fetch ?? fetch)(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        writes: buildWrites(projectId, documents),
        ...(transaction ? { transaction } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await readBoundedError(response, controller.signal);
      throw new FirestoreRestCommitError(
        canonicalErrorCode(response.status, body),
        'Firestore REST commit failed.',
        response.status,
      );
    }
    const body = await readBoundedJson(response, MAX_ERROR_RESPONSE_BYTES, controller.signal);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const record = body as { commitTime?: unknown; writeResults?: unknown };
    if (record.commitTime !== undefined && !isRfc3339Timestamp(record.commitTime)) {
      throw new FirestoreRestCommitError(
        'DATA_LOSS',
        'Firestore commit returned a malformed commit time.',
      );
    }
    if (record.writeResults === undefined) return null;
    if (!Array.isArray(record.writeResults)
        || record.writeResults.length !== documents.length) {
      throw new FirestoreRestCommitError(
        'DATA_LOSS',
        'Firestore commit returned incomplete write results.',
      );
    }
    const writes = record.writeResults.map((writeResult, writeIndex) => {
      if (!writeResult || typeof writeResult !== 'object' || Array.isArray(writeResult)) {
        throw new FirestoreRestCommitError(
          'DATA_LOSS',
          'Firestore commit returned a malformed write result.',
        );
      }
      const expectedFields = documents[writeIndex].serverTimestampFields ?? [];
      const rawTransformResults = (
        writeResult as { transformResults?: unknown }
      ).transformResults;
      const transformResults = rawTransformResults === undefined ? [] : rawTransformResults;
      if (!Array.isArray(transformResults) || transformResults.length !== expectedFields.length) {
        throw new FirestoreRestCommitError(
          'DATA_LOSS',
          'Firestore commit returned incomplete transform results.',
        );
      }
      return {
        path: documents[writeIndex].path,
        transformResults: Object.fromEntries(transformResults.map((result, transformIndex) => {
          const timestamp = result && typeof result === 'object' && !Array.isArray(result)
            ? (result as { timestampValue?: unknown }).timestampValue
            : undefined;
          if (!isRfc3339Timestamp(timestamp)) {
            throw new FirestoreRestCommitError(
              'DATA_LOSS',
              'Firestore commit returned a malformed transform timestamp.',
            );
          }
          return [expectedFields[transformIndex], timestamp];
        })),
      };
    });
    return {
      commitTime: record.commitTime ?? null,
      writes,
    };
  } catch (error) {
    if (error instanceof FirestoreRestCommitError) throw error;
    if (controller.signal.aborted
        || (error instanceof Error && error.name === 'AbortError')) {
      throw new FirestoreRestCommitError(
        'DEADLINE_EXCEEDED',
        'Firestore REST commit was aborted at its deadline.',
        undefined,
        { cause: error },
      );
    }
    throw new FirestoreRestCommitError(
      'UNAVAILABLE',
      'Firestore REST commit transport failed.',
      undefined,
      { cause: error },
    );
  } finally {
    clearTimeout(abortTimer);
  }
}
