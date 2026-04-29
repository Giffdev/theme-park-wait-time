'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-primary-400">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
        <h1 className="text-3xl font-bold text-primary-900">Dashboard</h1>
        <p className="mt-2 text-primary-500">
          Sign in to track your rides, log trips, and see your personal park stats.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 rounded-2xl bg-primary-50 p-8 text-center">
          <p className="text-primary-600">Sign in to start tracking your park adventures.</p>
          <Link
            href="/auth/signin"
            className="inline-flex rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
          >
            Sign In
          </Link>
        </div>
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
          <p className="text-sm text-primary-700">
            <span className="font-medium">Provider:</span>{' '}
            {user.providerData[0]?.providerId === 'google.com' ? 'Google' : 'Email/Password'}
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
