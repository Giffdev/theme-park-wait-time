'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Star } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import {
  canDiscardRideLogSave,
  createRideLog,
} from '@/lib/services/ride-log-service';
import { getCollection, whereConstraint } from '@/lib/firebase/firestore';
import { toLocalDateKey, useActiveRidePark } from '@/hooks/useActiveRidePark';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import WaitTimeInput from '@/components/ride-log/WaitTimeInput';
import type { WaitTimeMode } from '@/components/ride-log/WaitTimeInput';
import {
  isValidRideWaitTime,
  RIDE_WAIT_TIME_RANGE_MESSAGE,
} from '@/lib/wait-time-contract';

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
const RIDE_SAVE_TIMEOUT_MS = 10_000;

export function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `ride-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function isConfirmedPartialSave(error: unknown): error is Error & { savedLogId: string } {
  return error instanceof Error
    && 'code' in error
    && error.code === 'post-write-refresh-failed'
    && 'savedLogId' in error
    && typeof error.savedLogId === 'string';
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
  const [dateTime, setDateTime] = useState(() => formatDateTimeLocal(new Date()));
  const [waitTime, setWaitTime] = useState('');
  const [waitTimeMode, setWaitTimeMode] = useState<WaitTimeMode>('unknown');
  const [rating, setRating] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [discardAllowed, setDiscardAllowed] = useState(false);
  const savingRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);
  const dateKey = useMemo(() => toLocalDateKey(new Date(dateTime)), [dateTime]);
  const {
    tripId: activeTripId,
    tripName: activeTripName,
    recentParkId,
    setRecentParkId,
    loading: activeTripLoading,
    error: activeTripError,
    retry: retryActiveTrip,
  } = useActiveRidePark({
    enabled: Boolean(user),
    userId: user?.uid,
    dateKey,
  });
  const resetParkSelection = useCallback((nextParkId: string) => {
    setParkId(nextParkId);
    setAttractionId('');
    setAttractions([]);
    setError('');
    setDiscardAllowed(false);
    requestIdRef.current = null;
  }, []);

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
    let cancelled = false;
    setAttractions([]);
    getCollection<{ name: string; entityType?: string }>('attractions', [whereConstraint('parkId', '==', parkId)]).then((docs) => {
      if (!cancelled) setAttractions(
        docs
          .filter((d) => !d.entityType || LOGGABLE_ENTITY_TYPES.has(d.entityType))
          .map((d) => ({ id: d.id, name: d.name, entityType: d.entityType }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [parkId]);

  useEffect(() => {
    if (!activeTripLoading && !requestIdRef.current) {
      resetParkSelection(recentParkId ?? '');
    }
  }, [activeTripLoading, dateKey, recentParkId, resetParkSelection]);

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
    if (savingRef.current) return;

    if (!parkId || !attractionId) {
      setError('Please select a park and attraction.');
      return;
    }
    if (activeTripError || activeTripLoading) {
      setError(activeTripError ?? 'Still checking for an active trip. Please wait.');
      return;
    }
    const rideWaitTime = waitTimeMode === 'closed'
      ? null
      : waitTime
        ? Number(waitTime)
        : null;
    if (!isValidRideWaitTime(rideWaitTime)) {
      setError(RIDE_WAIT_TIME_RANGE_MESSAGE);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setSaved(false);
    setError('');
    setDiscardAllowed(false);
    requestIdRef.current ??= createRequestId();

    try {
      await createRideLog(user.uid, {
        parkId,
        attractionId,
        parkName: selectedParkName,
        attractionName: selectedAttractionName,
        rodeAt: new Date(dateTime),
        waitTimeMinutes: rideWaitTime,
        attractionClosed: waitTimeMode === 'closed',
        source: 'manual',
        rating,
        notes: '',
      }, activeTripLoading ? undefined : activeTripId, {
        requestId: requestIdRef.current,
        timeoutMs: RIDE_SAVE_TIMEOUT_MS,
        waitForTripStats: true,
      });
      setRecentParkId(parkId);
      setSaved(true);
      onSuccess?.();
    } catch (saveError) {
      if (
        isConfirmedPartialSave(saveError)
      ) {
        setRecentParkId(parkId);
        setSaved(true);
        onSuccess?.();
      } else {
        setDiscardAllowed(canDiscardRideLogSave(saveError));
        setError(
          saveError instanceof Error && /timed? out|too long/i.test(saveError.message)
            ? saveError.message
            : 'Failed to save ride log. Please try again.',
        );
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const commandFrozen = requestIdRef.current !== null;
  const handleDiscardFailedSave = () => {
    requestIdRef.current = null;
    setError('');
    setDiscardAllowed(false);
    setSaved(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {activeTripError && (
        <button
          type="button"
          onClick={retryActiveTrip}
          className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800"
        >
          Retry active trip check
        </button>
      )}
      {activeTripId && activeTripName && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          Adding to <strong>{activeTripName}</strong> · {dateKey}
        </div>
      )}

      {/* Park */}
      <div>
        <label className="mb-1 block text-sm font-medium text-primary-700">
          Park
        </label>
        <SearchableSelect
          options={parkOptions}
          value={parkId}
          onChange={resetParkSelection}
          placeholder="Search parks…"
          id="park-select"
          label="Park"
          disabled={activeTripLoading || commandFrozen}
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
          disabled={activeTripLoading || !parkId || commandFrozen}
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
          disabled={commandFrozen}
          onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker()}
          className="w-full rounded-xl border border-primary-200 px-4 py-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 cursor-pointer"
        />
      </div>

      {/* Wait time */}
      <WaitTimeInput
        value={waitTime}
        onChange={setWaitTime}
        mode={waitTimeMode}
        onModeChange={setWaitTimeMode}
        disabled={commandFrozen}
      />

      {/* Rating */}
      <div>
        <label className="mb-2 block text-sm font-medium text-primary-700">Rating (optional)</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star === rating ? null : star)}
              disabled={commandFrozen}
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
            disabled={commandFrozen}
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
          {saved ? 'Saved ✓' : saving ? 'Saving...' : commandFrozen ? 'Retry Save' : 'Log Ride 🎢'}
        </button>
      </div>
      {commandFrozen && error && discardAllowed && (
        <button
          type="button"
          onClick={handleDiscardFailedSave}
          className="w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Discard failed save & start over
        </button>
      )}
    </form>
  );
}
