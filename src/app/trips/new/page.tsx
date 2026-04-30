'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { createTrip } from '@/lib/services/trip-service';
import type { TripCreateData } from '@/types/trip';

export default function CreateTripPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tripName, setTripName] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);

  // Auto-suggest name from date
  const suggestedName = (() => {
    const d = new Date(startDate + 'T00:00:00');
    return `Trip · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  })();

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const name = tripName.trim() || suggestedName;
      const data: TripCreateData = {
        name,
        startDate,
        endDate: startDate,
        parkIds: [],
        parkNames: {},
        status: 'active',
        notes: '',
      };
      const tripId = await createTrip(user.uid, data);
      router.push(`/trips/${tripId}`);
    } catch (err) {
      console.error('Failed to create trip:', err);
      alert('Failed to create trip. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

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
        <div className="text-5xl">🗺️</div>
        <h2 className="text-xl font-semibold text-primary-800">Sign in to start a trip</h2>
        <p className="text-primary-500 max-w-sm">
          Track your rides, remember every moment. Sign in to get started.
        </p>
        <Link
          href="/auth/signin"
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          🚀 Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-24 md:pb-8">
      {/* Back link */}
      <Link href="/trips" className="inline-flex items-center gap-1 text-sm text-primary-500 hover:text-primary-700 mb-6">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to My Trips
      </Link>

      {/* Header */}
      <h1 className="text-2xl font-bold text-primary-900 sm:text-3xl">Start a Trip</h1>
      <p className="mt-1 text-primary-500 text-sm">
        Give it a name and start logging rides. Days and parks are added automatically as you go.
      </p>

      {/* Form */}
      <div className="mt-8 space-y-5">
        {/* Trip Name */}
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1">Trip Name</label>
          <input
            type="text"
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            placeholder={suggestedName}
            className="w-full rounded-lg border border-primary-200 px-4 py-3 text-sm text-primary-900 placeholder:text-primary-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <p className="mt-1 text-xs text-primary-400">Leave blank to use &ldquo;{suggestedName}&rdquo;</p>
        </div>

        {/* Start Date */}
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1">Start Date (optional)</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker()}
            className="w-full rounded-lg border border-primary-200 px-4 py-3 text-sm text-primary-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3.5 text-base font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Creating...' : 'Start Trip →'}
        </button>
      </div>
    </div>
  );
}
