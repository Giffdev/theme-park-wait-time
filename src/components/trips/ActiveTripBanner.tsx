'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';
import { getActiveTrip } from '@/lib/services/trip-service';
import type { Trip } from '@/types/trip';

export const ACTIVE_TRIP_CHANGED_EVENT = 'active-trip-changed';

/** Dispatch this event after any mutation that may affect the active trip (delete, complete, create). */
export function notifyActiveTripChanged() {
  window.dispatchEvent(new Event(ACTIVE_TRIP_CHANGED_EVENT));
}

export default function ActiveTripBanner() {
  const { user } = useAuth();
  const [trip, setTrip] = useState<(Trip & { id: string }) | null>(null);

  const refresh = useCallback(() => {
    if (!user) { setTrip(null); return; }
    getActiveTrip(user.uid).then(setTrip).catch(() => setTrip(null));
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener(ACTIVE_TRIP_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(ACTIVE_TRIP_CHANGED_EVENT, refresh);
  }, [refresh]);

  if (!trip) return null;

  const parks = Object.values(trip.parkNames ?? {}).slice(0, 2).join(', ');
  const more = Object.values(trip.parkNames ?? {}).length > 2 ? ` +${Object.values(trip.parkNames ?? {}).length - 2}` : '';

  return (
    <div className="border-b border-green-200 bg-green-50 px-4 py-2.5">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-green-800">
          🎢 Active Trip: <span className="font-semibold">{trip.name}</span>
          <span className="ml-1 text-green-600">— {parks}{more}</span>
        </p>
        <div className="flex gap-2">
          <Link
            href={`/trips/${trip.id}/log`}
            className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
          >
            Log Ride
          </Link>
          <Link
            href={`/trips/${trip.id}`}
            className="rounded-md border border-green-300 bg-white px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
          >
            View Trip
          </Link>
        </div>
      </div>
    </div>
  );
}
