'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { getTrip } from '@/lib/services/trip-service';
import { createRideLog } from '@/lib/services/ride-log-service';
import { getCollection } from '@/lib/firebase/firestore';
import type { Trip } from '@/types/trip';

interface AttractionOption {
  id: string;
  name: string;
}

export default function TripLogRidePage() {
  const { user, loading: authLoading } = useAuth();
  const { tripId } = useParams<{ tripId: string }>();
  const router = useRouter();

  const [trip, setTrip] = useState<(Trip & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [attractions, setAttractions] = useState<AttractionOption[]>([]);
  const [parkId, setParkId] = useState('');
  const [attractionId, setAttractionId] = useState('');
  const [dateTime, setDateTime] = useState(new Date().toISOString().slice(0, 16));
  const [waitTime, setWaitTime] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/signin');
    }
  }, [authLoading, user, router]);

  // Load trip data
  useEffect(() => {
    if (!user || !tripId) return;
    setLoading(true);
    getTrip(user.uid, tripId)
      .then((t) => {
        setTrip(t);
        // Auto-select if only one park
        if (t && t.parkIds.length === 1) {
          setParkId(t.parkIds[0]);
        }
      })
      .catch(() => setTrip(null))
      .finally(() => setLoading(false));
  }, [user, tripId]);

  // Load attractions when park changes
  useEffect(() => {
    if (!parkId) {
      setAttractions([]);
      return;
    }
    getCollection<{ name: string }>(`parks/${parkId}/attractions`).then((docs) => {
      setAttractions(
        docs.map((d) => ({ id: d.id, name: d.name })).sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, [parkId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !trip) return;

    if (!parkId || !attractionId) {
      setError('Please select a park and attraction.');
      return;
    }

    setSaving(true);
    setError('');

    const parkName = trip.parkNames[parkId] ?? '';
    const attractionName = attractions.find((a) => a.id === attractionId)?.name ?? '';

    try {
      await createRideLog(
        user.uid,
        {
          parkId,
          attractionId,
          parkName,
          attractionName,
          rodeAt: new Date(dateTime),
          waitTimeMinutes: waitTime ? parseInt(waitTime, 10) : null,
          source: 'manual',
          rating,
          notes,
        },
        tripId,
      );
      router.push(`/trips/${tripId}`);
    } catch {
      setError('Failed to save ride log. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-primary-600">Trip not found.</p>
        <Link href="/trips" className="mt-4 inline-block text-sm text-primary-500 hover:underline">
          ← Back to Trips
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/trips/${tripId}`}
          className="text-sm text-primary-500 hover:underline"
        >
          ← Back to {trip.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-900">Log a Ride 🎢</h1>
        <p className="mt-1 text-sm text-primary-500">
          Recording for <span className="font-medium text-primary-700">{trip.name}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Park selector */}
        <div>
          <label htmlFor="park-select" className="mb-1 block text-sm font-medium text-primary-700">
            Park
          </label>
          {trip.parkIds.length === 1 ? (
            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm font-medium text-primary-700">
              {trip.parkNames[trip.parkIds[0]]}
            </div>
          ) : (
            <select
              id="park-select"
              value={parkId}
              onChange={(e) => { setParkId(e.target.value); setAttractionId(''); }}
              className="w-full rounded-xl border border-primary-200 px-4 py-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              <option value="">Select a park...</option>
              {trip.parkIds.map((id) => (
                <option key={id} value={id}>{trip.parkNames[id]}</option>
              ))}
            </select>
          )}
        </div>

        {/* Attraction selector */}
        <div>
          <label htmlFor="attraction-select" className="mb-1 block text-sm font-medium text-primary-700">
            Attraction
          </label>
          <select
            id="attraction-select"
            value={attractionId}
            onChange={(e) => setAttractionId(e.target.value)}
            disabled={!parkId || attractions.length === 0}
            className="w-full rounded-xl border border-primary-200 px-4 py-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">{parkId && attractions.length === 0 ? 'Loading attractions...' : 'Select an attraction...'}</option>
            {attractions.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* Date/Time */}
        <div>
          <label htmlFor="ride-datetime" className="mb-1 block text-sm font-medium text-primary-700">
            Date & Time
          </label>
          <input
            id="ride-datetime"
            type="datetime-local"
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
            className="w-full rounded-xl border border-primary-200 px-4 py-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>

        {/* Wait time */}
        <div>
          <label htmlFor="wait-time" className="mb-1 block text-sm font-medium text-primary-700">
            Wait Time (optional)
          </label>
          <div className="relative">
            <input
              id="wait-time"
              type="number"
              min="0"
              max="300"
              value={waitTime}
              onChange={(e) => setWaitTime(e.target.value)}
              placeholder="Minutes"
              className="w-full rounded-xl border border-primary-200 px-4 py-3 pr-12 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-primary-400">min</span>
          </div>
        </div>

        {/* Rating */}
        <div>
          <label className="mb-2 block text-sm font-medium text-primary-700">Rating (optional)</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star === rating ? null : star)}
                className="transition-transform hover:scale-110 active:scale-95"
                aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
              >
                <Star
                  className={`h-7 w-7 ${
                    rating && star <= rating
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="ride-notes" className="mb-1 block text-sm font-medium text-primary-700">
            Notes (optional)
          </label>
          <textarea
            id="ride-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How was the ride?"
            rows={3}
            className="w-full rounded-xl border border-primary-200 px-4 py-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Link
            href={`/trips/${tripId}`}
            className="flex-1 rounded-xl border border-primary-200 px-4 py-3 text-center text-sm font-medium text-primary-600 hover:bg-primary-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Log Ride 🎢'}
          </button>
        </div>
      </form>
    </div>
  );
}
