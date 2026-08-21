import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { filterCurrentParkDocuments } from '@/lib/parks/park-document-read';
import type { ParkAvailabilityPhase } from '@/types/park-availability';

const API_BASE = 'https://api.themeparks.wiki/v1';

interface WikiScheduleEntry {
  date: string;
  type: string;
  openingTime: string;
  closingTime: string;
}

interface WikiScheduleResponse {
  id: string;
  name: string;
  timezone: string;
  schedule: WikiScheduleEntry[];
}

/**
 * Shape consumed by parks/page.tsx ParkHoursEntry and passed to ParkCard.
 *
 * `phase` replaces the old `isOpen: boolean` field, which collapsed upstream
 * errors, confirmed closed days, and after-close states into identical output.
 * `todayHours` is now preserved for CLOSED so the card can show closing time.
 */
interface ParkHoursResult {
  parkId: string;
  slug: string;
  timezone: string;
  phase: ParkAvailabilityPhase;
  /** HH:MM local strings in the park's own IANA timezone, or null when unavailable */
  todayHours: { openTime: string; closeTime: string } | null;
  /** Current clock time in the park's timezone, e.g. "9:30 AM" */
  localTime: string;
}

/**
 * Convert an ISO 8601 instant to a zero-padded 24-h "HH:MM" string in the
 * given IANA timezone so callers can format it without timezone awareness.
 */
function isoToLocalHHMM(iso: string, tz: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  // Some environments return '24' for midnight with hour12:false; normalize to '00'.
  const hNorm = h === '24' ? '00' : h;
  return `${hNorm}:${m}`;
}

/** Current wall-clock time in the park's IANA timezone, formatted "H:MM AM/PM" */
function parkLocalTime(tz: string): string {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * GET /api/park-hours
 * Returns current availability phase and operating hours for ALL parks.
 * Designed for the parks listing page to show status at a glance.
 *
 * Phase contract:
 *   OPEN     - Inside OPERATING window right now.
 *   UPCOMING - Today has an OPERATING entry; park has not yet opened.
 *   CLOSED   - Today had an OPERATING entry that has now passed.
 *   NO_DATA  - Schedule fetched but no OPERATING entry for today.
 *   ERROR    - Upstream fetch failed; status unknown, never assert Closed.
 */
export async function GET() {
  try {
    const parksSnapshot = await adminDb.collection('parks').get();
    const parks = filterCurrentParkDocuments(
      parksSnapshot.docs.map(
        (doc) => ({
          ...(doc.data() as { name: string; slug: string; timezone: string }),
          id: doc.id,
        })
      )
    );

    // Fetch schedules in parallel for all parks
    const results: ParkHoursResult[] = await Promise.all(
      parks.map(async (park): Promise<ParkHoursResult> => {
        const base: Omit<ParkHoursResult, 'phase' | 'todayHours'> = {
          parkId: park.id,
          slug: park.slug,
          timezone: park.timezone,
          localTime: parkLocalTime(park.timezone),
        };

        try {
          const res = await fetch(`${API_BASE}/entity/${park.id}/schedule`, {
            next: { revalidate: 300 },
          });

          if (!res.ok) {
            // Upstream error - never assert Closed; report ERROR so the card
            // can show "schedule unavailable" rather than "Closed".
            return { ...base, phase: 'ERROR', todayHours: null };
          }

          const data = (await res.json()) as WikiScheduleResponse;
          const allEntries = data.schedule || [];

          // Get today in park's local timezone
          const now = new Date();
          const todayStr = now.toLocaleDateString('en-CA', { timeZone: park.timezone });

          const operatingEntry = allEntries.find(
            (e) => e.date === todayStr && e.type === 'OPERATING'
          );

          if (!operatingEntry) {
            // Schedule fetched successfully but no OPERATING entry for today.
            // Could be a confirmed-closed day, a holiday, or beyond the
            // schedule horizon - report NO_DATA, not CLOSED.
            return { ...base, phase: 'NO_DATA', todayHours: null };
          }

          // Epoch-safe phase derivation: compare milliseconds so the viewer's
          // local clock and timezone never influence the result.
          const nowMs = Date.now();
          const openMs = new Date(operatingEntry.openingTime).getTime();
          const closeMs = new Date(operatingEntry.closingTime).getTime();
          const isCurrentlyOpen = nowMs >= openMs && nowMs < closeMs;
          const isUpcoming = nowMs < openMs;

          // Convert ISO instants to HH:MM in the park's own timezone so
          // ParkCard.formatTime receives the park-local hour, not the viewer's.
          const openTime = isoToLocalHHMM(operatingEntry.openingTime, park.timezone);
          const closeTime = isoToLocalHHMM(operatingEntry.closingTime, park.timezone);

          // Always preserve todayHours when the OPERATING entry is confirmed -
          // CLOSED cards can show "Closed at X PM" rather than losing that info.
          const todayHours = { openTime, closeTime };

          if (isCurrentlyOpen) {
            return { ...base, phase: 'OPEN', todayHours };
          }
          if (isUpcoming) {
            return { ...base, phase: 'UPCOMING', todayHours };
          }
          // Park operated today but the window has passed.
          return { ...base, phase: 'CLOSED', todayHours };
        } catch (err) {
          console.error(`Failed to fetch schedule for ${park.name} (${park.id}):`, err);
          return { ...base, phase: 'ERROR', todayHours: null };
        }
      })
    );

    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      parks: results,
    });
  } catch (error) {
    console.error('Park hours batch API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch park hours' },
      { status: 500 }
    );
  }
}
