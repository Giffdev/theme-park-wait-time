const LEGACY_STORAGE_PREFIX = 'tpwt:pending-save:v1:';
const PRODUCTION_DATABASE_NAME = 'tpwt-pending-save-v2';
const DATABASE_VERSION = 2;
const STORE_NAME = 'commands';
const TOMBSTONE_STORE_NAME = 'completion-tombstones';
const UID_INDEX = 'uid';
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TOMBSTONE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 8;
const MAX_TOMBSTONES = 32;
const MAX_SERIALIZED_BYTES = 32_768;

interface StoredEntry<T = unknown> {
  uid: string;
  context: string;
  createdAt: number;
  expiresAt: number;
  command: T;
}

interface LegacyStoredEntry<T = unknown> {
  createdAt: number;
  expiresAt: number;
  command: T;
}

interface CompletionTombstone {
  uid: string;
  context: string;
  requestId: string;
  commandFingerprint: string;
  completedAt: number;
  expiresAt: number;
}

type LegacyStoredEntries = Record<string, LegacyStoredEntry>;

export type PendingSaveStorageResult =
  | { ok: true; idempotent: boolean }
  | {
      ok: false;
      reason:
        | 'unavailable'
        | 'read-failed'
        | 'oversized'
        | 'capacity'
        | 'conflict'
        | 'write-failed';
      existingRequestId?: string;
    };

export type PendingSaveRemovalResult =
  | { ok: true; removed: boolean }
  | {
      ok: false;
      reason: 'unavailable' | 'read-failed' | 'mismatch' | 'stale' | 'write-failed';
      existingRequestId?: string;
    };

let databasePromise: Promise<IDBDatabase> | null = null;
let databaseNameOverride: string | null = null;
let testMemoryEntries: Map<string, StoredEntry> | null = null;
let testMemoryTombstones: Map<string, CompletionTombstone> | null = null;
let afterMigrationForTests: (() => void) | null = null;
let removalFailureForTests: (() => void) | null = null;
let removalDelayForTests: (() => Promise<void>) | null = null;
let removalMidTransactionDelayForTests: (() => Promise<void>) | null = null;

class StalePendingSaveRemovalError extends Error {
  constructor() {
    super('Pending save removal is stale');
    this.name = 'StalePendingSaveRemovalError';
  }
}

function databaseName(): string {
  return databaseNameOverride ?? PRODUCTION_DATABASE_NAME;
}

function memoryKey(uid: string, context: string): string {
  return `${uid}\u0000${context}`;
}

function tombstoneKey(uid: string, context: string, requestId: string): string {
  return `${uid}\u0000${context}\u0000${requestId}`;
}

export function pendingSaveStorageErrorMessage(
  action: 'save this ride' | 'create this trip',
  result: Extract<PendingSaveStorageResult, { ok: false }>,
): string {
  if (result.reason === 'conflict') {
    return `Cannot ${action} because another tab already has a different pending request `
      + 'for this form. Return to that tab or reload to retry it; no request was sent.';
  }
  if (result.reason === 'capacity') {
    return `Cannot ${action} because pending-save storage is full. `
      + 'Retry or finish an existing pending save before starting another; no request was sent.';
  }
  if (result.reason === 'oversized') {
    return `Cannot ${action} because its retry record is too large. `
      + 'Shorten the notes and try again; no request was sent.';
  }
  return `Cannot ${action} because retry protection is unavailable. `
    + 'Enable browser storage or free space, then try again; no request was sent.';
}

export function pendingSaveRemovalErrorMessage(
  action: 'ride save' | 'trip creation',
  result: Extract<PendingSaveRemovalResult, { ok: false }>,
): string {
  if (result.reason === 'mismatch') {
    return `The ${action} finished, but another tab has a newer pending request for this form. `
      + 'That newer request was preserved.';
  }
  return `The ${action} finished, but its local retry record could not be cleared. `
    + 'Reload before retrying; the same request ID will be reused.';
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  }
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalSerialize(
      (value as Record<string, unknown>)[key],
    )}`)
    .join(',')}}`;
}

function requestIdOf(command: unknown): string | null {
  if (!command || typeof command !== 'object' || Array.isArray(command)) return null;
  const requestId = (command as { requestId?: unknown }).requestId;
  return typeof requestId === 'string' && requestId.length > 0 ? requestId : null;
}

function commandFingerprint(command: unknown): string {
  return canonicalSerialize(command);
}

function isStructurallyValidEntry(
  entry: unknown,
  now: number,
): entry is StoredEntry {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const value = entry as Partial<StoredEntry>;
  return typeof value.uid === 'string'
    && typeof value.context === 'string'
    && typeof value.createdAt === 'number'
    && typeof value.expiresAt === 'number'
    && value.expiresAt > now
    && requestIdOf(value.command) !== null;
}

function isStructurallyValidLegacyEntry(
  entry: unknown,
  now: number,
): entry is LegacyStoredEntry {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const value = entry as Partial<LegacyStoredEntry>;
  return typeof value.createdAt === 'number'
    && typeof value.expiresAt === 'number'
    && value.expiresAt > now
    && requestIdOf(value.command) !== null;
}

function isStructurallyValidTombstone(
  tombstone: unknown,
  now: number,
): tombstone is CompletionTombstone {
  if (!tombstone || typeof tombstone !== 'object' || Array.isArray(tombstone)) return false;
  const value = tombstone as Partial<CompletionTombstone>;
  return typeof value.uid === 'string'
    && typeof value.context === 'string'
    && typeof value.requestId === 'string'
    && typeof value.commandFingerprint === 'string'
    && typeof value.completedAt === 'number'
    && typeof value.expiresAt === 'number'
    && value.expiresAt > now;
}

function getIndexedDb(): IDBFactory | null {
  try {
    return typeof window === 'undefined' ? null : window.indexedDB ?? null;
  } catch {
    return null;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  const indexedDb = getIndexedDb();
  if (!indexedDb) return Promise.reject(new Error('IndexedDB is unavailable'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDb.open(databaseName(), DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: ['uid', 'context'],
        });
        store.createIndex(UID_INDEX, 'uid', { unique: false });
      }
      if (!database.objectStoreNames.contains(TOMBSTONE_STORE_NAME)) {
        const tombstones = database.createObjectStore(TOMBSTONE_STORE_NAME, {
          keyPath: ['uid', 'context', 'requestId'],
        });
        tombstones.createIndex(UID_INDEX, 'uid', { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('IndexedDB open failed'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('IndexedDB open blocked'));
    };
  });
  return databasePromise;
}

function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function keepTransactionAliveUntil<T>(
  store: IDBObjectStore,
  pending: Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let value: T;
    let failure: unknown;
    pending.then(
      (result) => {
        value = result;
        settled = true;
      },
      (error) => {
        failure = error;
        settled = true;
      },
    );

    const pump = () => {
      const request = store.get(['__transaction-keepalive__', '__transaction-keepalive__']);
      request.onsuccess = () => {
        if (!settled) {
          pump();
        } else if (failure !== undefined) {
          reject(failure);
        } else {
          resolve(value);
        }
      };
      request.onerror = () => reject(
        request.error ?? new Error('IndexedDB transaction keepalive failed'),
      );
    };
    pump();
  });
}

async function runUidTransaction<T>(
  uid: string,
  operation: (
    store: IDBObjectStore,
    entries: StoredEntry[],
    tombstoneStore: IDBObjectStore,
    tombstones: CompletionTombstone[],
    now: number,
    transaction: IDBTransaction,
  ) => Promise<T> | T,
): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(
      [STORE_NAME, TOMBSTONE_STORE_NAME],
      'readwrite',
    );
    const store = transaction.objectStore(STORE_NAME);
    const tombstoneStore = transaction.objectStore(TOMBSTONE_STORE_NAME);
    let result: T;
    let operationError: unknown;

    Promise.all([
      requestPromise(store.index(UID_INDEX).getAll(IDBKeyRange.only(uid))),
      requestPromise(tombstoneStore.index(UID_INDEX).getAll(IDBKeyRange.only(uid))),
    ])
      .then(async ([rawEntries, rawTombstones]) => {
        const now = Date.now();
        const entries: StoredEntry[] = [];
        const tombstones: CompletionTombstone[] = [];
        for (const rawEntry of rawEntries) {
          if (isStructurallyValidEntry(rawEntry, now)) {
            entries.push(rawEntry);
          } else if (
            rawEntry
            && typeof rawEntry === 'object'
            && typeof (rawEntry as Partial<StoredEntry>).uid === 'string'
            && typeof (rawEntry as Partial<StoredEntry>).context === 'string'
          ) {
            store.delete([
              (rawEntry as StoredEntry).uid,
              (rawEntry as StoredEntry).context,
            ]);
          }
        }
        for (const rawTombstone of rawTombstones) {
          if (isStructurallyValidTombstone(rawTombstone, now)) {
            tombstones.push(rawTombstone);
          } else if (
            rawTombstone
            && typeof rawTombstone === 'object'
            && typeof (rawTombstone as Partial<CompletionTombstone>).uid === 'string'
            && typeof (rawTombstone as Partial<CompletionTombstone>).context === 'string'
            && typeof (rawTombstone as Partial<CompletionTombstone>).requestId === 'string'
          ) {
            const invalid = rawTombstone as CompletionTombstone;
            tombstoneStore.delete([invalid.uid, invalid.context, invalid.requestId]);
          }
        }
        result = await operation(store, entries, tombstoneStore, tombstones, now, transaction);
      })
      .catch((error) => {
        operationError = error;
        try {
          transaction.abort();
        } catch {
          // The transaction may already have been aborted by the operation.
        }
      });

    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(operationError ?? transaction.error ?? new Error(
      'IndexedDB transaction aborted',
    ));
    transaction.onerror = () => {
      operationError ??= transaction.error;
    };
  });
}

function legacyStorageKey(uid: string): string {
  return `${LEGACY_STORAGE_PREFIX}${encodeURIComponent(uid)}`;
}

function readLegacyEntries(uid: string): {
  entries: LegacyStoredEntries;
  readable: boolean;
} {
  let storage: Storage | null;
  try {
    storage = typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return { entries: {}, readable: false };
  }
  if (!storage) return { entries: {}, readable: true };
  const key = legacyStorageKey(uid);
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { entries: {}, readable: true };
    }
    const now = Date.now();
    const entries = Object.fromEntries(
      Object.entries(parsed as LegacyStoredEntries)
        .filter(([, entry]) => isStructurallyValidLegacyEntry(entry, now)),
    );
    return { entries, readable: true };
  } catch {
    return { entries: {}, readable: true };
  }
}

function entryBytes(entry: StoredEntry): number {
  return serializedBytes(entry);
}

async function migrateLegacyEntries(
  uid: string,
  store: IDBObjectStore,
  entries: StoredEntry[],
  tombstones: CompletionTombstone[],
  legacy: ReturnType<typeof readLegacyEntries>,
): Promise<void> {
  // Legacy storage remains independently writable until old bundles are retired.
  const byContext = new Map(entries.map((entry) => [entry.context, entry]));

  for (const [context, legacyEntry] of Object.entries(legacy.entries)) {
    const migrated: StoredEntry = { uid, context, ...legacyEntry };
    const legacyRequestId = requestIdOf(legacyEntry.command);
    const completed = tombstones.some((tombstone) => (
      tombstone.context === context
      && tombstone.requestId === legacyRequestId
      && tombstone.commandFingerprint === commandFingerprint(legacyEntry.command)
    ));
    if (completed) continue;
    const existing = byContext.get(context);
    if (existing) continue;
    if (byContext.size >= MAX_ENTRIES
      || serializedBytes([...byContext.values(), migrated]) > MAX_SERIALIZED_BYTES) {
      continue;
    }
    await requestPromise(store.add(migrated));
    byContext.set(context, migrated);
    entries.push(migrated);
  }
}

function classifyStorageError(
  error: unknown,
  fallback: 'read-failed' | 'write-failed',
): Extract<PendingSaveStorageResult, { ok: false }> {
  if (error instanceof DOMException
    && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
    return { ok: false, reason: 'capacity' };
  }
  return { ok: false, reason: fallback };
}

export async function loadPendingSaveCommand<T>(
  uid: string,
  context: string,
  isValid: (value: unknown) => value is T,
): Promise<T | null> {
  if (testMemoryEntries) {
    const key = memoryKey(uid, context);
    const entry = testMemoryEntries.get(key);
    if (!entry) return null;
    if (!isStructurallyValidEntry(entry, Date.now()) || !isValid(entry.command)) {
      testMemoryEntries.delete(key);
      return null;
    }
    return entry.command;
  }
  if (!getIndexedDb()) return null;
  const legacy = readLegacyEntries(uid);
  try {
    const value = await runUidTransaction(uid, async (store, entries, _tombstoneStore, tombstones) => {
      await migrateLegacyEntries(uid, store, entries, tombstones, legacy);
      const entry = entries.find((candidate) => candidate.context === context);
      if (!entry) return null;
      if (!isValid(entry.command)) {
        store.delete([uid, context]);
        return null;
      }
      return entry.command;
    });
    afterMigrationForTests?.();
    return value;
  } catch {
    return null;
  }
}

export async function storePendingSaveCommand<T extends { requestId: string }>(
  uid: string,
  context: string,
  command: T,
): Promise<PendingSaveStorageResult> {
  const now = Date.now();
  const newEntry: StoredEntry<T> = {
    uid,
    context,
    createdAt: now,
    expiresAt: now + RETENTION_MS,
    command,
  };
  if (entryBytes(newEntry) > MAX_SERIALIZED_BYTES) {
    return { ok: false, reason: 'oversized' };
  }
  if (testMemoryEntries) {
    const key = memoryKey(uid, context);
    const existing = testMemoryEntries.get(key);
    if (existing) {
      const exact = requestIdOf(existing.command) === command.requestId
        && canonicalSerialize(existing.command) === canonicalSerialize(command);
      return exact
        ? { ok: true, idempotent: true }
        : {
            ok: false,
            reason: 'conflict',
            existingRequestId: requestIdOf(existing.command) ?? undefined,
          };
    }
    const uidEntries = [...testMemoryEntries.values()].filter((entry) => entry.uid === uid);
    if (uidEntries.length >= MAX_ENTRIES
      || serializedBytes([...uidEntries, newEntry]) > MAX_SERIALIZED_BYTES) {
      return { ok: false, reason: 'capacity' };
    }
    testMemoryEntries.set(key, newEntry);
    return { ok: true, idempotent: false };
  }
  if (!getIndexedDb()) return { ok: false, reason: 'unavailable' };
  const legacy = readLegacyEntries(uid);
  if (!legacy.readable) return { ok: false, reason: 'read-failed' };

  try {
    const result = await runUidTransaction(uid, async (store, entries, _tombstoneStore, tombstones) => {
      await migrateLegacyEntries(uid, store, entries, tombstones, legacy);
      const existing = entries.find((entry) => entry.context === context);
      if (existing) {
        const exact = existing.command
          && requestIdOf(existing.command) === command.requestId
          && canonicalSerialize(existing.command) === canonicalSerialize(command);
        return exact
          ? { ok: true, idempotent: true } as PendingSaveStorageResult
          : {
            ok: false,
            reason: 'conflict',
            existingRequestId: requestIdOf(existing.command) ?? undefined,
          } as PendingSaveStorageResult;
      }
      if (entries.length >= MAX_ENTRIES
        || serializedBytes([...entries, newEntry]) > MAX_SERIALIZED_BYTES) {
        return { ok: false, reason: 'capacity' } as PendingSaveStorageResult;
      }
      await requestPromise(store.add(newEntry));
      return { ok: true, idempotent: false } as PendingSaveStorageResult;
    });
    afterMigrationForTests?.();
    return result;
  } catch (error) {
    return classifyStorageError(error, 'write-failed');
  }
}

export async function removePendingSaveCommand(
  uid: string,
  context: string,
  requestId: string,
  isCurrent: () => boolean = () => true,
): Promise<PendingSaveRemovalResult> {
  await removalDelayForTests?.();
  if (testMemoryEntries) {
    const key = memoryKey(uid, context);
    const existing = testMemoryEntries.get(key);
    if (!existing) return { ok: true, removed: false };
    const existingRequestId = requestIdOf(existing.command);
    if (existingRequestId !== requestId) {
      return {
        ok: false,
        reason: 'mismatch',
        existingRequestId: existingRequestId ?? undefined,
      } as PendingSaveRemovalResult;
    }
    if (!isCurrent()) return { ok: false, reason: 'stale' };
    try {
      removalFailureForTests?.();
    } catch {
      return { ok: false, reason: 'write-failed' };
    }
    const now = Date.now();
    const tombstone: CompletionTombstone = {
      uid,
      context,
      requestId,
      commandFingerprint: commandFingerprint(existing.command),
      completedAt: now,
      expiresAt: now + TOMBSTONE_RETENTION_MS,
    };
    testMemoryEntries.delete(key);
    testMemoryTombstones?.set(tombstoneKey(uid, context, requestId), tombstone);
    return { ok: true, removed: true };
  }
  if (!getIndexedDb()) return { ok: false, reason: 'unavailable' };
  const legacy = readLegacyEntries(uid);
  try {
    const result = await runUidTransaction(uid, async (
      store,
      entries,
      tombstoneStore,
      tombstones,
      now,
      transaction,
    ) => {
      await migrateLegacyEntries(uid, store, entries, tombstones, legacy);
      const existing = entries.find((entry) => entry.context === context);
      if (!existing) {
        return { ok: true, removed: false } as PendingSaveRemovalResult;
      }
      const existingRequestId = requestIdOf(existing.command);
      if (existingRequestId !== requestId) {
        return {
          ok: false,
          reason: 'mismatch',
          existingRequestId: existingRequestId ?? undefined,
        } as PendingSaveRemovalResult;
      }
      if (!isCurrent()) return { ok: false, reason: 'stale' } as PendingSaveRemovalResult;
      const tombstone: CompletionTombstone = {
        uid,
        context,
        requestId,
        commandFingerprint: commandFingerprint(existing.command),
        completedAt: now,
        expiresAt: now + TOMBSTONE_RETENTION_MS,
      };
      const retainedTombstones = tombstones
        .filter((candidate) => !(
          candidate.context === context && candidate.requestId === requestId
        ))
        .sort((left, right) => left.completedAt - right.completedAt);
      while (retainedTombstones.length >= MAX_TOMBSTONES) {
        const oldest = retainedTombstones.shift();
        if (oldest) {
          await requestPromise(tombstoneStore.delete([
            oldest.uid,
            oldest.context,
            oldest.requestId,
          ]));
        }
      }
      await requestPromise(tombstoneStore.put(tombstone));
      if (removalMidTransactionDelayForTests) {
        await keepTransactionAliveUntil(store, removalMidTransactionDelayForTests());
      }
      if (!isCurrent()) {
        transaction.abort();
        throw new StalePendingSaveRemovalError();
      }
      await requestPromise(store.delete([uid, context]));
      await new Promise<void>((resolve, reject) => {
        const guardRequest = store.get([uid, context]);
        guardRequest.onsuccess = () => {
          if (!isCurrent()) {
            transaction.abort();
            reject(new StalePendingSaveRemovalError());
            return;
          }
          resolve();
        };
        guardRequest.onerror = () => reject(
          guardRequest.error ?? new Error('IndexedDB currentness guard failed'),
        );
      });
      removalFailureForTests?.();
      return { ok: true, removed: true } as PendingSaveRemovalResult;
    });
    afterMigrationForTests?.();
    return result;
  } catch (error) {
    if (error instanceof StalePendingSaveRemovalError) {
      return { ok: false, reason: 'stale' };
    }
    return { ok: false, reason: 'write-failed' };
  }
}

export async function resetPendingSaveCommandStorageForTests(): Promise<void> {
  if (testMemoryEntries) {
    testMemoryEntries.clear();
    testMemoryTombstones?.clear();
    return;
  }
  const indexedDb = getIndexedDb();
  if (!indexedDb) return;
  const database = databasePromise ? await databasePromise.catch(() => null) : null;
  database?.close();
  databasePromise = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDb.deleteDatabase(databaseName());
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('IndexedDB delete failed'));
    request.onblocked = () => reject(new Error('IndexedDB delete blocked'));
  });
}

export function configurePendingSaveCommandStorageForTests(name: string): void {
  testMemoryEntries = null;
  testMemoryTombstones = null;
  if (databaseNameOverride === name) return;
  void databasePromise?.then((database) => database.close(), () => {});
  databasePromise = null;
  databaseNameOverride = name;
}

export function configurePendingSaveCommandMemoryStorageForTests(): void {
  void databasePromise?.then((database) => database.close(), () => {});
  databasePromise = null;
  testMemoryEntries = new Map();
  testMemoryTombstones = new Map();
}

export function configurePendingSaveCommandAfterMigrationForTests(
  callback: (() => void) | null,
): void {
  afterMigrationForTests = callback;
}

export function configurePendingSaveCommandRemovalFailureForTests(
  callback: (() => void) | null,
): void {
  removalFailureForTests = callback;
}

export function configurePendingSaveCommandRemovalDelayForTests(
  callback: (() => Promise<void>) | null,
): void {
  removalDelayForTests = callback;
}

export function configurePendingSaveCommandRemovalMidTransactionDelayForTests(
  callback: (() => Promise<void>) | null,
): void {
  removalMidTransactionDelayForTests = callback;
}
