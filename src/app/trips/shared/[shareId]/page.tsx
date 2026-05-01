'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Clock, MapPin, Star, Trophy } from 'lucide-react';

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
    favoriteAttraction?: string | null;
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
      return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Derive favorite attraction from ride logs if not in stats
  const favoriteAttraction = trip.stats.favoriteAttraction || (() => {
    if (rideLogs.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const log of rideLogs) {
      counts[log.attractionName] = (counts[log.attractionName] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  })();

  // Group rides by park
  const ridesByPark: Record<string, SharedRideLog[]> = {};
  for (const log of rideLogs) {
    const park = log.parkName || 'Unknown Park';
    if (!ridesByPark[park]) ridesByPark[park] = [];
    ridesByPark[park].push(log);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-24 sm:px-6 md:pb-10 lg:px-8">
      {/* Hero Header */}
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-primary-700 to-primary-800 p-6 sm:p-8 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/20" />
          <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/10" />
        </div>
        <div className="relative">
          <p className="text-xs font-medium uppercase tracking-wider text-white/70 mb-1">Shared Trip</p>
          <h1 className="text-2xl sm:text-3xl font-bold">{trip.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/80">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDate(trip.startDate)}
              {trip.endDate && trip.endDate !== trip.startDate && ` — ${formatDate(trip.endDate)}`}
            </span>
          </div>
          {Object.values(trip.parkNames ?? {}).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.values(trip.parkNames ?? {}).map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 text-xs font-medium text-white"
                >
                  <MapPin className="h-3 w-3" />
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      {trip.stats.totalRides > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-primary-100 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-indigo-600">{trip.stats.totalRides}</div>
            <div className="text-xs font-medium text-primary-500 mt-1">Total Rides</div>
          </div>
          <div className="rounded-xl border border-primary-100 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-indigo-600">
              {trip.stats.totalWaitMinutes < 60
                ? `${trip.stats.totalWaitMinutes}m`
                : `${Math.floor(trip.stats.totalWaitMinutes / 60)}h ${trip.stats.totalWaitMinutes % 60}m`}
            </div>
            <div className="text-xs font-medium text-primary-500 mt-1">Total Wait</div>
          </div>
          <div className="rounded-xl border border-primary-100 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-indigo-600">{trip.stats.parksVisited}</div>
            <div className="text-xs font-medium text-primary-500 mt-1">Parks Visited</div>
          </div>
          <div className="rounded-xl border border-primary-100 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-indigo-600">{trip.stats.uniqueAttractions}</div>
            <div className="text-xs font-medium text-primary-500 mt-1">Unique Rides</div>
          </div>
        </div>
      )}

      {/* Favorite Attraction */}
      {favoriteAttraction && (
        <div className="mb-8 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Trophy className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Favorite Attraction</p>
            <p className="text-sm font-semibold text-amber-900">{favoriteAttraction}</p>
          </div>
        </div>
      )}

      {/* Notes */}
      {trip.notes && (
        <div className="mb-8 rounded-xl border border-primary-100 bg-primary-50/50 p-4">
          <p className="text-sm text-primary-700 italic">&ldquo;{trip.notes}&rdquo;</p>
        </div>
      )}

      {/* Ride Logs grouped by park */}
      <h2 className="mb-4 text-lg font-semibold text-primary-900">
        Rides & Experiences ({rideLogs.length})
      </h2>
      {rideLogs.length === 0 ? (
        <p className="text-primary-400 text-sm">No rides logged for this trip yet.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(ridesByPark).map(([parkName, logs]) => (
            <div key={parkName}>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-primary-400" />
                <h3 className="text-sm font-semibold text-primary-700">{parkName}</h3>
                <span className="text-xs text-primary-400">({logs.length})</span>
              </div>
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded-xl border border-primary-100 bg-white px-4 py-3 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-primary-900 truncate">{log.attractionName}</p>
                      {log.rating != null && log.rating > 0 && (
                        <div className="flex items-center gap-0.5 mt-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3 w-3 ${i < log.rating! ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      {log.waitTimeMinutes != null ? (
                        log.waitTimeMinutes === 0 ? (
                          <span className="inline-flex items-center rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-semibold text-green-700">
                            Walk-on
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 border border-primary-200 px-2 py-0.5 text-xs font-semibold text-primary-700">
                            <Clock className="h-3 w-3" />
                            {log.waitTimeMinutes} min
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-12 rounded-2xl bg-gradient-to-r from-indigo-50 to-primary-50 border border-indigo-100 p-6 sm:p-8 text-center">
        <div className="text-4xl mb-3">🎢</div>
        <h3 className="text-lg font-semibold text-primary-900 mb-2">Track your own park visits</h3>
        <p className="text-sm text-primary-500 max-w-md mx-auto mb-5">
          Log rides, track wait times, and share your adventures with friends and family.
        </p>
        <Link
          href="/auth/signin"
          className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 hover:shadow-lg transition-all"
        >
          Sign up free →
        </Link>
      </div>
    </div>
  );
}

