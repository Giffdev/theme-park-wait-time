'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { getTrips } from '@/lib/services/trip-service';
import TripCard from '@/components/trips/TripCard';
import type { Trip } from '@/types/trip';

interface TripSection {
  key: string;
  label: string;
  status: Trip['status'];
  accent?: string;
  muted?: boolean;
}

const SECTIONS: TripSection[] = [
  { key: 'active', label: 'Active Trips', status: 'active', accent: 'border-l-green-500' },
  { key: 'upcoming', label: 'Upcoming Trips', status: 'planning' },
  { key: 'past', label: 'Past Trips', status: 'completed', muted: true },
];

export default function TripsPage() {
  const { user, loading: authLoading } = useAuth();
  const [allTrips, setAllTrips] = useState<(Trip & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrips = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getTrips(user.uid);
      setAllTrips(data);
    } catch (err) {
      console.error('Failed to load trips:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchTrips();
  }, [user, fetchTrips]);

  const grouped = useMemo(() => {
    const map: Record<string, (Trip & { id: string })[]> = {};
    for (const section of SECTIONS) {
      map[section.key] = allTrips.filter((t) => t.status === section.status);
    }
    return map;
  }, [allTrips]);

  const hasAnyTrips = allTrips.length > 0;

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-5xl">🎢</div>
        <h2 className="text-xl font-semibold text-primary-800">Sign in to relive your park adventures</h2>
        <p className="text-primary-500 max-w-sm">
          Every coaster conquered, every churro eaten — your full theme park history awaits. Sign in to start logging!
        </p>
        <Link
          href="/auth/signin"
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          🎟️ Sign In to See Your Trips
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 sm:text-3xl">My Park Trips</h1>
          <p className="mt-1 text-primary-500">Your complete theme park experience history</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchTrips} disabled={loading} className="rounded-full p-2 text-primary-500 hover:bg-primary-50 disabled:opacity-50" aria-label="Refresh trips">
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            href="/trips/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Trip
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="mt-8">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          </div>
        ) : !hasAnyTrips ? (
          <div className="rounded-2xl border-2 border-dashed border-primary-200 py-16 text-center">
            <div className="text-5xl mb-4">🎟️</div>
            <h2 className="text-xl font-semibold text-primary-800">No Trips Logged Yet</h2>
            <p className="mt-2 text-primary-500 max-w-sm mx-auto">
              Start logging theme park trips to build your experience history.
              Use the <Link href="/calendar" className="text-primary-700 underline hover:text-primary-900">Crowd Calendar</Link> to pick the best days!
            </p>
            <Link
              href="/trips/new"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-coral-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-coral-600"
            >
              Start Logging Trips
            </Link>
          </div>
        ) : (
          <div className="space-y-10">
            {SECTIONS.map((section) => {
              const sectionTrips = grouped[section.key];
              if (sectionTrips.length === 0) return null;

              return (
                <section key={section.key} aria-labelledby={`section-${section.key}`}>
                  <h2
                    id={`section-${section.key}`}
                    className={`mb-4 text-lg font-semibold ${
                      section.muted ? 'text-primary-400' : 'text-primary-800'
                    }`}
                  >
                    {section.label}
                    <span className="ml-2 text-sm font-normal text-primary-400">
                      ({sectionTrips.length})
                    </span>
                  </h2>
                  <div className={`space-y-3 ${section.accent ? `border-l-4 ${section.accent} pl-4` : ''} ${section.muted ? 'opacity-75' : ''}`}>
                    {sectionTrips.map((trip) => (
                      <TripCard key={trip.id} trip={trip} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
