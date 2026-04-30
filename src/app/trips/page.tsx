'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { getTrips } from '@/lib/services/trip-service';
import TripCard from '@/components/trips/TripCard';
import type { Trip, TripStatus } from '@/types/trip';

type TabKey = 'active' | 'upcoming' | 'past';

const TAB_STATUS_MAP: Record<TabKey, TripStatus> = {
  active: 'active',
  upcoming: 'planning',
  past: 'completed',
};

export default function TripsPage() {
  const { user, loading: authLoading } = useAuth();
  const [trips, setTrips] = useState<(Trip & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('active');

  const fetchTrips = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getTrips(user.uid, { status: TAB_STATUS_MAP[tab] });
      setTrips(data);
    } catch (err) {
      console.error('Failed to load trips:', err);
    } finally {
      setLoading(false);
    }
  }, [user, tab]);

  useEffect(() => {
    if (user) fetchTrips();
  }, [user, fetchTrips]);

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

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 sm:text-3xl">My Park Trips</h1>
          <p className="mt-1 text-primary-500">Your complete theme park experience history</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchTrips} disabled={loading} className="rounded-full p-2 text-primary-500 hover:bg-primary-50 disabled:opacity-50">
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

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-lg bg-primary-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-primary-900 shadow-sm'
                : 'text-primary-500 hover:text-primary-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          </div>
        ) : trips.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-primary-200 py-16 text-center">
            <div className="text-5xl mb-4">🎟️</div>
            <h2 className="text-xl font-semibold text-primary-800">No Trips Logged Yet</h2>
            <p className="mt-2 text-primary-500 max-w-sm mx-auto">
              Start logging theme park trips to build your experience history
            </p>
            <Link
              href="/trips/new"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-coral-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-coral-600"
            >
              Start Logging Trips
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
