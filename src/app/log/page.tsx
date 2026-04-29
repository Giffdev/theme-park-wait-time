import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Log a Ride',
  description: 'Log your ride experiences and build your park history.',
};

export default function LogPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      <h1 className="text-3xl font-bold text-primary-900">Log a Ride</h1>
      <p className="mt-2 text-primary-500">
        Quick-log rides as you experience them. Sign in to save your history.
      </p>

      <div className="mt-8 rounded-2xl border border-primary-200 bg-white p-6">
        <p className="text-center text-primary-400">
          🎢 Ride logging form coming soon. Sign in to get started.
        </p>
        <div className="mt-4 text-center">
          <a
            href="/auth/signin"
            className="inline-flex rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Sign In to Start Logging
          </a>
        </div>
      </div>
    </div>
  );
}
