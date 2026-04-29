import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ride History',
  description: 'View your complete ride history across all parks.',
};

export default function RideHistoryPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      <h1 className="text-3xl font-bold text-primary-900">Ride History</h1>
      <p className="mt-2 text-primary-500">Your complete ride log across all park visits.</p>

      <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-primary-200 bg-primary-50 p-12 text-center">
        <span className="text-4xl">📋</span>
        <p className="text-primary-500">No rides logged yet. Start logging on your next park visit!</p>
      </div>
    </div>
  );
}
