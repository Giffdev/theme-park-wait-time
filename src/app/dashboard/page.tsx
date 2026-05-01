'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { getRideLogs } from '@/lib/services/ride-log-service';
import { getTrips } from '@/lib/services/trip-service';

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({ totalRides: 0, parksVisited: 0, tripsLogged: 0, totalWaitMinutes: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setStatsLoading(true);
    Promise.all([getRideLogs(user.uid), getTrips(user.uid)])
      .then(([logs, trips]) => {
        setStats({
          totalRides: logs.length,
          parksVisited: new Set(logs.map((l) => l.parkId)).size,
          tripsLogged: trips.length,
          totalWaitMinutes: logs.reduce((sum, l) => sum + (l.waitTimeMinutes ?? 0), 0),
        });
      })
      .finally(() => setStatsLoading(false));
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-5xl">📊</div>
        <h2 className="text-xl font-semibold text-primary-800">Sign in to see your park stats</h2>
        <p className="text-primary-500 max-w-sm">
          Rides conquered, parks explored, wait times survived — your personal theme park dashboard awaits!
        </p>
        <Link
          href="/auth/signin"
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          🏆 Sign In to See Stats
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary-900">Dashboard</h1>
          <p className="mt-1 text-primary-500">
            Welcome back, {user.displayName || user.email}!
          </p>
        </div>
        <button
          onClick={async () => { await signOut(); router.push('/'); }}
          className="rounded-full border border-primary-200 px-4 py-2 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50"
        >
          Sign Out
        </button>
      </div>

      {/* User info card */}
      <div className="mt-6 rounded-xl border border-primary-100 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-400">Account</h2>
        <div className="mt-3 space-y-2">
          {user.displayName && (
            <p className="text-sm text-primary-700">
              <span className="font-medium">Name:</span> {user.displayName}
            </p>
          )}
          <p className="text-sm text-primary-700">
            <span className="font-medium">Email:</span> {user.email}
          </p>

        </div>
      </div>

      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Rides', value: statsLoading ? '…' : String(stats.totalRides), emoji: '🎢', href: '/ride-log' },
          { label: 'Parks Visited', value: statsLoading ? '…' : String(stats.parksVisited), emoji: '🏰', href: '/parks' },
          { label: 'Trips Logged', value: statsLoading ? '…' : String(stats.tripsLogged), emoji: '📝', href: '/trips' },
          { label: 'Min. Waited', value: statsLoading ? '…' : String(stats.totalWaitMinutes), emoji: '⏱️', href: '/ride-log' },
        ].map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-xl border border-primary-100 bg-white p-5 text-center transition-colors hover:border-primary-300 hover:shadow-sm"
          >
            <div className="text-2xl">{stat.emoji}</div>
            <div className="mt-2 text-2xl font-bold text-primary-700">{stat.value}</div>
            <div className="text-sm text-primary-400">{stat.label}</div>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/calendar" className="inline-flex items-center gap-2 rounded-lg border border-primary-200 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50">
          📅 Plan with Crowd Calendar
        </Link>
        <Link href="/trips/new" className="inline-flex items-center gap-2 rounded-lg border border-primary-200 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50">
          ✈️ Log a New Trip
        </Link>
      </div>
    </div>
  );
}
