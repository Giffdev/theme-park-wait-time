import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

// Simple in-memory rate limiting (per-IP, resets on cold start)
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);

  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT;
}

/**
 * GET /api/trips/[shareId]
 * Public endpoint — returns shared trip data + ride logs as JSON.
 * No auth required. Reads via firebase-admin using the sharedTrips index.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;

  // Basic rate limiting by IP
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  // Validate shareId format
  if (!shareId || shareId.length < 10 || shareId.length > 30) {
    return NextResponse.json({ error: 'Invalid share link.' }, { status: 400 });
  }

  try {
    // Look up share index
    const shareDoc = await adminDb.collection('sharedTrips').doc(shareId).get();
    if (!shareDoc.exists) {
      return NextResponse.json({ error: 'Shared trip not found.' }, { status: 404 });
    }

    const { userId, tripId } = shareDoc.data() as { userId: string; tripId: string };

    // Fetch the trip document
    const tripDoc = await adminDb
      .collection('users')
      .doc(userId)
      .collection('trips')
      .doc(tripId)
      .get();

    if (!tripDoc.exists) {
      return NextResponse.json({ error: 'Trip no longer exists.' }, { status: 404 });
    }

    const tripData = tripDoc.data()!;

    // Fetch ride logs for this trip
    const rideLogsSnapshot = await adminDb
      .collection('users')
      .doc(userId)
      .collection('rideLogs')
      .where('tripId', '==', tripId)
      .orderBy('rodeAt', 'desc')
      .get();

    const rideLogs = rideLogsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      trip: {
        id: tripDoc.id,
        name: tripData.name,
        startDate: tripData.startDate,
        endDate: tripData.endDate,
        parkIds: tripData.parkIds,
        parkNames: tripData.parkNames,
        status: tripData.status,
        stats: tripData.stats,
        notes: tripData.notes,
      },
      rideLogs,
    });
  } catch (error) {
    console.error('[api/trips/shareId] Error fetching shared trip:', error);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
