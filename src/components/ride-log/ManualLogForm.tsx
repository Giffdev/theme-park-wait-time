'use client';

import { useState, useEffect, useMemo } from 'react';
import { Star } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { createRideLog } from '@/lib/services/ride-log-service';
import { getCollection, whereConstraint } from '@/lib/firebase/firestore';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

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
  entityType?: string;
}

// Only these entity types are loggable (excludes RESTAURANT, SHOP, MERCHANDISE, HOTEL, etc.)
const LOGGABLE_ENTITY_TYPES = new Set(['ATTRACTION', 'RIDE', 'SHOW', 'MEET_AND_GREET']);

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
  const [waitTimeUnknown, setWaitTimeUnknown] = useState(false);
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
    getCollection<{ name: string; entityType?: string }>('attractions', [whereConstraint('parkId', '==', parkId)]).then((docs) => {
      setAttractions(
        docs
          .filter((d) => !d.entityType || LOGGABLE_ENTITY_TYPES.has(d.entityType))
          .map((d) => ({ id: d.id, name: d.name, entityType: d.entityType }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, [parkId]);

  const selectedParkName = parks.find((p) => p.id === parkId)?.name ?? '';
  const selectedAttractionName = attractions.find((a) => a.id === attractionId)?.name ?? '';

  const parkOptions = useMemo(
    () => parks.map((p) => ({ id: p.id, label: p.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [parks],
  );

  const attractionOptions = useMemo(
    () => attractions.map((a) => ({ id: a.id, label: a.name })),
    [attractions],
  );

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
        waitTimeMinutes: waitTimeUnknown ? null : (waitTime ? parseInt(waitTime, 10) : null),
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
        <label className="mb-1 block text-sm font-medium text-primary-700">
          Park
        </label>
        <SearchableSelect
          options={parkOptions}
          value={parkId}
          onChange={(val) => { setParkId(val); setAttractionId(''); }}
          placeholder="Search parks…"
          id="park-select"
          label="Park"
        />
      </div>

      {/* Attraction */}
      <div>
        <label className="mb-1 block text-sm font-medium text-primary-700">
          Attraction
        </label>
        <SearchableSelect
          options={attractionOptions}
          value={attractionId}
          onChange={(val) => setAttractionId(val)}
          placeholder="Search attractions…"
          disabled={!parkId}
          id="attraction-select"
          label="Attraction"
        />
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
          onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker()}
          className="w-full rounded-xl border border-primary-200 px-4 py-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 cursor-pointer"
        />
      </div>

      {/* Wait time */}
      <div>
        <label htmlFor="wait-time" className="mb-1 block text-sm font-medium text-primary-700">
          Wait Time (optional)
        </label>
        {!waitTimeUnknown && (
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
        )}
        {waitTimeUnknown && (
          <div className="flex items-center justify-center rounded-xl border border-primary-100 bg-primary-50/50 px-4 py-3">
            <span className="text-sm font-medium text-primary-400">Unknown</span>
          </div>
        )}
        <label className="mt-2 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={waitTimeUnknown}
            onChange={(e) => {
              setWaitTimeUnknown(e.target.checked);
              if (e.target.checked) setWaitTime('');
            }}
            className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-xs text-primary-500">I don&apos;t remember</span>
        </label>
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
