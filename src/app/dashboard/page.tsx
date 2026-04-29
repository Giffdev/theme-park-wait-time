'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();

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
          onClick={signOut}
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
          { label: 'Total Rides', value: '—', emoji: '🎢' },
          { label: 'Parks Visited', value: '—', emoji: '🏰' },
          { label: 'Trips Logged', value: '—', emoji: '📝' },
          { label: 'Crowd Reports', value: '—', emoji: '📊' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-primary-100 bg-white p-5 text-center"
          >
            <div className="text-2xl">{stat.emoji}</div>
            <div className="mt-2 text-2xl font-bold text-primary-700">{stat.value}</div>
            <div className="text-sm text-primary-400">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
