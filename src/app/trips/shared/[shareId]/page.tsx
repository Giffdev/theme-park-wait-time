'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface SharedTrip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  parkNames: string[];
  status: string;
  stats: {
    totalRides: number;
    totalWaitMinutes: number;
    parksVisited: number;
    uniqueAttractions: number;
  };
  notes?: string;
}

interface SharedRideLog {
  id: string;
  attractionName: string;
  parkName: string;
  waitTimeMinutes?: number;
  rating?: number;
  rodeAt: string;
}

export default function SharedTripPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [trip, setTrip] = useState<SharedTrip | null>(null);
  const [rideLogs, setRideLogs] = useState<SharedRideLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) return;
    setLoading(true);
    fetch(`/api/trips/${shareId}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to load shared trip');
        }
        return res.json();
      })
      .then((data) => {
        setTrip(data.trip);
        setRideLogs(data.rideLogs || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [shareId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-5xl">🔗</div>
        <h2 className="text-xl font-semibold text-primary-800">
          {error || 'Trip not found'}
        </h2>
        <p className="text-primary-500 max-w-sm">
          This shared trip link may have expired or been removed.
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          Go Home
        </Link>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm font-medium text-primary-400 uppercase tracking-wide">Shared Trip</p>
        <h1 className="mt-1 text-3xl font-bold text-primary-900">{trip.name}</h1>
        <p className="mt-1 text-primary-500">
          {formatDate(trip.startDate)}
          {trip.endDate && trip.endDate !== trip.startDate && ` — ${formatDate(trip.endDate)}`}
        </p>
        {trip.parkNames.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {trip.parkNames.map((name) => (
              <span
                key={name}
                className="inline-flex items-center rounded-full bg-primary-100 px-3 py-1 text-xs font-medium text-primary-700"
              >
                🏰 {name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      {trip.stats.totalRides > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-primary-100 bg-white p-3 text-center">
            <div className="text-xl font-bold text-primary-700">{trip.stats.totalRides}</div>
            <div className="text-xs text-primary-500">Total Rides</div>
          </div>
          <div className="rounded-lg border border-primary-100 bg-white p-3 text-center">
            <div className="text-xl font-bold text-primary-700">{trip.stats.totalWaitMinutes}</div>
            <div className="text-xs text-primary-500">Min. Waited</div>
          </div>
          <div className="rounded-lg border border-primary-100 bg-white p-3 text-center">
            <div className="text-xl font-bold text-primary-700">{trip.stats.parksVisited}</div>
            <div className="text-xs text-primary-500">Parks Visited</div>
          </div>
          <div className="rounded-lg border border-primary-100 bg-white p-3 text-center">
            <div className="text-xl font-bold text-primary-700">{trip.stats.uniqueAttractions}</div>
            <div className="text-xs text-primary-500">Unique Rides</div>
          </div>
        </div>
      )}

      {/* Notes */}
      {trip.notes && (
        <div className="mb-8 rounded-xl border border-primary-100 bg-primary-50 p-4">
          <p className="text-sm text-primary-700">{trip.notes}</p>
        </div>
      )}

      {/* Ride Logs */}
      <h2 className="mb-4 text-lg font-semibold text-primary-800">
        Rides ({rideLogs.length})
      </h2>
      {rideLogs.length === 0 ? (
        <p className="text-primary-400 text-sm">No rides logged for this trip yet.</p>
      ) : (
        <div className="space-y-3">
          {rideLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between rounded-xl border border-primary-100 bg-white p-4"
            >
              <div>
                <p className="font-medium text-primary-900">{log.attractionName}</p>
                <p className="text-xs text-primary-400">{log.parkName}</p>
              </div>
              <div className="text-right">
                {log.waitTimeMinutes != null && (
                  <p className="text-sm font-semibold text-primary-700">
                    {log.waitTimeMinutes} min
                  </p>
                )}
                {log.rating != null && (
                  <p className="text-xs text-primary-400">
                    {'⭐'.repeat(log.rating)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-10 text-center">
        <p className="text-sm text-primary-400 mb-3">Want to track your own park visits?</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
        >
          🎢 Try ParkPulse
        </Link>
      </div>
    </div>
  );
}
