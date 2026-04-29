import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your personal theme park dashboard — ride logs, stats, and trip history.',
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      <h1 className="text-3xl font-bold text-primary-900">Dashboard</h1>
      <p className="mt-2 text-primary-500">
        Sign in to track your rides, log trips, and see your personal park stats.
      </p>

      {/* Placeholder stats */}
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

      {/* CTA */}
      <div className="mt-10 flex flex-col items-center gap-4 rounded-2xl bg-primary-50 p-8 text-center">
        <p className="text-primary-600">Sign in to start tracking your park adventures.</p>
        <a
          href="/auth/signin"
          className="inline-flex rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
        >
          Sign In
        </a>
      </div>
    </div>
  );
}
