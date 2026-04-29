'use client';

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { createRideLog } from '@/lib/services/ride-log-service';
import { getCollection } from '@/lib/firebase/firestore';

interface ManualLogFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface ParkOption {
  id: string;
  name: string;
}

interface AttractionOption {
  id: string;
  name: string;
}

/**
 * Form for manually adding a ride log entry (without timer).
 */
export default function ManualLogForm({ onSuccess, onCancel }: ManualLogFormProps) {
  const { user } = useAuth();
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [attractions, setAttractions] = useState<AttractionOption[]>([]);
  const [parkId, setParkId] = useState('');
  const [attractionId, setAttractionId] = useState('');
  const [dateTime, setDateTime] = useState(new Date().toISOString().slice(0, 16));
  const [waitTime, setWaitTime] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load parks on mount
  useEffect(() => {
    getCollection<{ name: string }>('parks').then((docs) => {
      setParks(docs.map((d) => ({ id: d.id, name: d.name })));
    });
  }, []);

  // Load attractions when park changes
  useEffect(() => {
    if (!parkId) {
      setAttractions([]);
      return;
    }
    getCollection<{ name: string }>(`parks/${parkId}/attractions`).then((docs) => {
      setAttractions(docs.map((d) => ({ id: d.id, name: d.name })));
    });
  }, [parkId]);

  const selectedParkName = parks.find((p) => p.id === parkId)?.name ?? '';
  const selectedAttractionName = attractions.find((a) => a.id === attractionId)?.name ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!parkId || !attractionId) {
      setError('Please select a park and attraction.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await createRideLog(user.uid, {
        parkId,
        attractionId,
        parkName: selectedParkName,
        attractionName: selectedAttractionName,
        rodeAt: new Date(dateTime),
        waitTimeMinutes: waitTime ? parseInt(waitTime, 10) : null,
        source: 'manual',
        rating,
        notes: '',
      });
      onSuccess?.();
    } catch {
      setError('Failed to save ride log. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Park */}
      <div>
        <label htmlFor="park-select" className="mb-1 block text-sm font-medium text-primary-700">
          Park
        </label>
        <select
          id="park-select"
          value={parkId}
          onChange={(e) => { setParkId(e.target.value); setAttractionId(''); }}
          className="w-full rounded-xl border border-primary-200 px-4 py-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        >
          <option value="">Select a park...</option>
          {parks.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Attraction */}
      <div>
        <label htmlFor="attraction-select" className="mb-1 block text-sm font-medium text-primary-700">
          Attraction
        </label>
        <select
          id="attraction-select"
          value={attractionId}
          onChange={(e) => setAttractionId(e.target.value)}
          disabled={!parkId}
          className="w-full rounded-xl border border-primary-200 px-4 py-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">Select an attraction...</option>
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

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-primary-200 px-4 py-3 text-sm font-medium text-primary-600 hover:bg-primary-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Log Ride 🎢'}
        </button>
      </div>
    </form>
  );
}
