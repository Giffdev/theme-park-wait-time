export const maxDuration = 20;
export const dynamic = 'force-dynamic';

import { createHash } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminServiceAccount } from '@/lib/firebase/admin';
import {
  batchGetFirestoreDocuments,
  beginFirestoreTransaction,
  commitFirestoreDocuments,
  createServiceAccountAccessTokenProvider,
  FirestoreRestCommitError,
  rollbackFirestoreTransaction,
  runFirestoreEqualityQuery,
  type FirestoreRestCommitDependencies,
  type FirestoreReadDocument,
} from '@/lib/firebase/firestore-rest-commit';
import { isFirestorePathSegment } from '@/lib/server/firestore-path';
import {
  canonicalFirestoreTimestamp,
  parseFirestoreTimestamp,
} from '@/lib/firestore-timestamp';

const PAGE_SIZE = 20;
const ROUTE_DEADLINE_MS = 17_000;
const RATE_WINDOW_MS = 60_000;
const PER_CLIENT_LIMIT = 30;
const GLOBAL_LIMIT = 300;

interface RideCursor {
  rodeAt: string;
  id: string;
}

class SharedTripRateLimitError extends Error {}

function canonicalTrustedIp(request: Request): string {
  const candidate = (
    request.headers.get('x-vercel-forwarded-for')
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'
  ).split(',')[0].trim().toLowerCase();
  return candidate.length <= 64 && /^[0-9a-f:.]+$/.test(candidate) ? candidate : 'unknown';
}

async function claimRequestSlot(
  request: Request,
  transport: FirestoreRestCommitDependencies,
): Promise<void> {
  const now = Date.now();
  const bucket = Math.floor(now / RATE_WINDOW_MS);
  const clientHash = createHash('sha256')
    .update(`${canonicalTrustedIp(request)}\u0000${bucket}`)
    .digest('hex');
  const clientPath = `sharedTripRateLimits/${bucket}-${clientHash}`;
  const globalPath = `sharedTripRateLimits/${bucket}-global`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let transaction: string | null = null;
    try {
      transaction = await beginFirestoreTransaction(transport);
      const documents = await batchGetFirestoreDocuments(
        [clientPath, globalPath],
        transport,
        transaction,
      );
      const clientCount = Number(documents.get(clientPath)?.fields.count ?? 0);
      const globalCount = Number(documents.get(globalPath)?.fields.count ?? 0);
      if (clientCount >= PER_CLIENT_LIMIT || globalCount >= GLOBAL_LIMIT) {
        throw new SharedTripRateLimitError();
      }
      const expiresAt = Timestamp.fromMillis((bucket + 2) * RATE_WINDOW_MS);
      await commitFirestoreDocuments([
        {
          path: clientPath,
          fields: { count: clientCount + 1, expiresAt },
          operation: documents.get(clientPath) ? 'update' : 'create',
          updateMaskFields: ['count', 'expiresAt'],
        },
        {
          path: globalPath,
          fields: { count: globalCount + 1, expiresAt },
          operation: documents.get(globalPath) ? 'update' : 'create',
          updateMaskFields: ['count', 'expiresAt'],
        },
      ], transport, transaction);
      transaction = null;
      return;
    } catch (error) {
      if (transaction) {
        await rollbackFirestoreTransaction(transaction, transport).catch(() => {});
      }
      if (error instanceof SharedTripRateLimitError) throw error;
      if (error instanceof FirestoreRestCommitError
          && error.code === 'ABORTED'
          && attempt === 0) continue;
      throw error;
    }
  }
}

function parseCursor(raw: string | null): RideCursor | null {
  if (!raw) return null;
  if (raw.length > 512) throw new Error('INVALID_CURSOR');
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<RideCursor>;
    if (typeof value.rodeAt !== 'string'
        || !parseFirestoreTimestamp(value.rodeAt)
        || typeof value.id !== 'string'
        || !isFirestorePathSegment(value.id)) {
      throw new Error('INVALID_CURSOR');
    }
    return { rodeAt: value.rodeAt, id: value.id };
  } catch {
    throw new Error('INVALID_CURSOR');
  }
}

function encodeCursor(cursor: RideCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function timestampIso(value: unknown): string | null {
  return canonicalFirestoreTimestamp(value)?.rfc3339 ?? null;
}

function documentId(document: FirestoreReadDocument): string {
  return document.path.slice(document.path.lastIndexOf('/') + 1);
}

function json(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'private, no-store');
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const deadlineAt = Date.now() + ROUTE_DEADLINE_MS;
  const { shareId } = await params;
  if (!shareId || shareId.length < 10 || shareId.length > 30
      || !isFirestorePathSegment(shareId)) {
    return json({ error: 'Invalid share link.' }, { status: 400 });
  }

  let cursor: RideCursor | null;
  try {
    cursor = parseCursor(new URL(request.url).searchParams.get('cursor'));
  } catch {
    return json({ error: 'Invalid ride-log cursor.' }, { status: 400 });
  }

  try {
    const transport = {
      deadlineAt,
      accessTokenProvider: createServiceAccountAccessTokenProvider(
        getAdminServiceAccount(),
        { deadlineAt },
      ),
    };
    await claimRequestSlot(request, transport);
    const sharePath = `sharedTrips/${shareId}`;
    const shareDoc = (await batchGetFirestoreDocuments(
      [sharePath],
      transport,
    )).get(sharePath);
    if (!shareDoc) {
      return json({ error: 'Shared trip not found.' }, { status: 404 });
    }
    const shareData = shareDoc.fields;
    if (typeof shareData.userId !== 'string'
        || typeof shareData.tripId !== 'string'
        || !isFirestorePathSegment(shareData.userId)
        || !isFirestorePathSegment(shareData.tripId)) {
      return json({ error: 'Shared trip is unavailable.' }, { status: 404 });
    }

    const tripPath = `users/${shareData.userId}/trips/${shareData.tripId}`;
    const tripDoc = (await batchGetFirestoreDocuments(
      [tripPath],
      transport,
    )).get(tripPath);
    if (!tripDoc) {
      return json({ error: 'Trip no longer exists.' }, { status: 404 });
    }
    const tripData = tripDoc.fields;
    if (tripData.shareId !== shareId) {
      return json({ error: 'Shared trip not found.' }, { status: 404 });
    }

    const cursorTimestamp = cursor ? parseFirestoreTimestamp(cursor.rodeAt)! : null;
    const rideLogsResult = await runFirestoreEqualityQuery({
      collectionPath: `users/${shareData.userId}/rideLogs`,
      field: 'tripId',
      value: shareData.tripId,
      orderBy: [
        { field: 'rodeAt', direction: 'DESCENDING' },
        { field: '__name__', direction: 'DESCENDING' },
      ],
      ...(cursorTimestamp
        ? {
            startAfter: {
              values: [new Timestamp(cursorTimestamp.seconds, cursorTimestamp.nanoseconds)],
              documentPath: `users/${shareData.userId}/rideLogs/${cursor!.id}`,
            },
          }
        : {}),
      projectionFields: [
        'attractionName',
        'parkName',
        'waitTimeMinutes',
        'rating',
        'rodeAt',
      ],
      pageSize: PAGE_SIZE + 1,
      limit: PAGE_SIZE + 1,
      maxDocuments: PAGE_SIZE + 1,
    }, transport);
    const hasMore = rideLogsResult.documents.length > PAGE_SIZE;
    const pageDocs = rideLogsResult.documents.slice(0, PAGE_SIZE);
    const rideLogs = pageDocs.map((doc) => {
      const log = doc.fields;
      return {
        id: documentId(doc),
        attractionName: typeof log.attractionName === 'string' ? log.attractionName : '',
        parkName: typeof log.parkName === 'string' ? log.parkName : '',
        waitTimeMinutes: typeof log.waitTimeMinutes === 'number'
          ? log.waitTimeMinutes
          : null,
        rating: typeof log.rating === 'number' ? log.rating : null,
        rodeAt: timestampIso(log.rodeAt),
      };
    });
    const lastDoc = hasMore ? pageDocs.at(-1) : null;
    const lastRodeAt = lastDoc ? timestampIso(lastDoc.fields.rodeAt) : null;
    const nextCursor = lastDoc && lastRodeAt
      ? encodeCursor({ rodeAt: lastRodeAt, id: documentId(lastDoc) })
      : null;

    return json({
      trip: {
        id: documentId(tripDoc),
        name: tripData.name,
        startDate: tripData.startDate,
        endDate: tripData.endDate,
        parkIds: tripData.parkIds,
        parkNames: tripData.parkNames,
        status: tripData.status,
        stats: tripData.stats,
        statsUpdatedAt: timestampIso(tripData.statsUpdatedAt),
        notes: tripData.notes,
      },
      rideLogs,
      nextCursor,
    });
  } catch (error) {
    if (error instanceof SharedTripRateLimitError) {
      return json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '60' },
        },
      );
    }
    const deadline = error instanceof FirestoreRestCommitError
      && error.code === 'DEADLINE_EXCEEDED';
    console.error('[api/trips/shareId] Error fetching shared trip:', deadline ? 'deadline' : error);
    return json(
      { error: deadline ? 'Shared trip request timed out.' : 'Internal server error.' },
      { status: deadline ? 504 : 500 },
    );
  }
}
