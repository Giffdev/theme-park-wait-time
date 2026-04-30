'use client';

import Link from 'next/link';
import type { Trip } from '@/types/trip';

interface TripCardProps {
  trip: Trip & { id: string };
}

function statusBadge(status: Trip['status']) {
  switch (status) {
    case 'active':
      return <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Active</span>;
    case 'planning':
      return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">Upcoming</span>;
    case 'completed':
      return <span className="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700">Completed</span>;
  }
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (start === end) return s.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', { ...opts, year: sameYear ? undefined : 'numeric' })}, ${e.getFullYear()}`;
}

export default function TripCard({ trip }: TripCardProps) {
  const parkNamesList = Object.values(trip.parkNames ?? {});

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="group block rounded-xl border border-primary-100 bg-white p-5 shadow-sm transition-all hover:border-primary-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-primary-900 group-hover:text-primary-700">
            {trip.name}
          </h3>
          <p className="mt-1 text-sm text-primary-500">{formatDateRange(trip.startDate, trip.endDate)}</p>
        </div>
        {statusBadge(trip.status)}
      </div>

      {parkNamesList.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {parkNamesList.slice(0, 4).map((name) => (
            <span key={name} className="rounded-md bg-primary-50 px-2 py-0.5 text-xs text-primary-600">
              {name}
            </span>
          ))}
          {parkNamesList.length > 4 && (
            <span className="rounded-md bg-primary-50 px-2 py-0.5 text-xs text-primary-500">
              +{parkNamesList.length - 4} more
            </span>
          )}
        </div>
      ) : trip.stats.parksVisited > 0 && (
        <div className="mt-3">
          <span className="rounded-md bg-primary-50 px-2 py-0.5 text-xs text-primary-500">
            🏰 {trip.stats.parksVisited} park{trip.stats.parksVisited !== 1 ? 's' : ''} visited
          </span>
        </div>
      )}

      {trip.stats.totalRides > 0 && (
        <div className="mt-3 flex gap-4 text-xs text-primary-500">
          <span>🎢 {trip.stats.totalRides} rides</span>
          <span>⏱️ {trip.stats.totalWaitMinutes} min waited</span>
          <span>🏰 {trip.stats.parksVisited} parks</span>
        </div>
      )}
    </Link>
  );
}
