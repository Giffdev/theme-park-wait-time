import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  writeBatch,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type QueryConstraint,
  type DocumentSnapshot,
  type QuerySnapshot,
  type SetOptions,
  type WhereFilterOp,
  type OrderByDirection,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from './config';

// ---------------------------------------------------------------------------
// Generic CRUD helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a single document by path.
 * Returns the data with `id` merged in, or null if it doesn't exist.
 */
export async function getDocument<T extends DocumentData>(
  collectionPath: string,
  docId: string,
): Promise<(T & { id: string }) | null> {
  const snap: DocumentSnapshot = await getDoc(doc(db, collectionPath, docId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as T) };
}

/**
 * Fetch all documents in a collection, optionally filtered/sorted.
 */
export async function getCollection<T extends DocumentData>(
  collectionPath: string,
  constraints: QueryConstraint[] = [],
): Promise<(T & { id: string })[]> {
  const q = query(collection(db, collectionPath), ...constraints);
  const snap: QuerySnapshot = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
}

/**
 * Add a new document with an auto-generated ID.
 */
export async function addDocument<T extends DocumentData>(
  collectionPath: string,
  data: T,
): Promise<DocumentReference> {
  return addDoc(collection(db, collectionPath), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Create or overwrite a document with a known ID.
 */
export async function setDocument<T extends DocumentData>(
  collectionPath: string,
  docId: string,
  data: T,
  options?: SetOptions,
): Promise<void> {
  return setDoc(
    doc(db, collectionPath, docId),
    { ...data, updatedAt: serverTimestamp() },
    options ?? {},
  );
}

/**
 * Partially update an existing document.
 */
export async function updateDocument<T extends DocumentData>(
  collectionPath: string,
  docId: string,
  data: Partial<T>,
): Promise<void> {
  return updateDoc(doc(db, collectionPath, docId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a document.
 */
export async function deleteDocument(
  collectionPath: string,
  docId: string,
): Promise<void> {
  return deleteDoc(doc(db, collectionPath, docId));
}

// ---------------------------------------------------------------------------
// Typed query builder helpers
// ---------------------------------------------------------------------------

export function whereConstraint(
  field: string,
  op: WhereFilterOp,
  value: unknown,
): QueryConstraint {
  return where(field, op, value);
}

export function orderByConstraint(
  field: string,
  direction: OrderByDirection = 'asc',
): QueryConstraint {
  return orderBy(field, direction);
}

export function limitConstraint(n: number): QueryConstraint {
  return limit(n);
}

export function startAfterConstraint(
  ...values: unknown[]
): QueryConstraint {
  return startAfter(...values);
}

// ---------------------------------------------------------------------------
// Batch write helpers
// ---------------------------------------------------------------------------

/**
 * Create a new Firestore write batch.
 */
export function createBatch(): WriteBatch {
  return writeBatch(db);
}

/**
 * Add a set operation to a batch.
 */
export function batchSet<T extends DocumentData>(
  batch: WriteBatch,
  collectionPath: string,
  docId: string,
  data: T,
): void {
  batch.set(doc(db, collectionPath, docId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Add an update operation to a batch.
 */
export function batchUpdate<T extends DocumentData>(
  batch: WriteBatch,
  collectionPath: string,
  docId: string,
  data: Partial<T>,
): void {
  batch.update(doc(db, collectionPath, docId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Add a delete operation to a batch.
 */
export function batchDelete(
  batch: WriteBatch,
  collectionPath: string,
  docId: string,
): void {
  batch.delete(doc(db, collectionPath, docId));
}

// ---------------------------------------------------------------------------
// Timestamp utilities
// ---------------------------------------------------------------------------

/**
 * Return a Firestore server timestamp sentinel (for writes).
 */
export function getServerTimestamp() {
  return serverTimestamp();
}

/**
 * Convert a Firestore Timestamp to a JS Date.
 */
export function timestampToDate(ts: Timestamp): Date {
  return ts.toDate();
}

/**
 * Convert a JS Date (or epoch ms) to a Firestore Timestamp.
 */
export function dateToTimestamp(date: Date | number): Timestamp {
  return Timestamp.fromDate(date instanceof Date ? date : new Date(date));
}

/**
 * Return a Firestore Timestamp representing "now".
 */
export function timestampNow(): Timestamp {
  return Timestamp.now();
}
