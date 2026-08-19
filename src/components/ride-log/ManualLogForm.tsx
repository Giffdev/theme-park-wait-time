'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Star } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import {
  pendingSaveRemovalErrorMessage,
  pendingSaveStorageErrorMessage,
} from '@/lib/services/pending-save-command-storage';
import {
  canDiscardRideLogSave,
  createRideLog,
} from '@/lib/services/ride-log-service';
import { getCollection, whereConstraint } from '@/lib/firebase/firestore';
import { withReadDeadline } from '@/lib/services/bounded-read';
import { toLocalDateKey, useActiveRidePark } from '@/hooks/useActiveRidePark';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import WaitTimeInput from '@/components/ride-log/WaitTimeInput';
import type { WaitTimeMode } from '@/components/ride-log/WaitTimeInput';
import {
  isValidRideWaitTime,
  RIDE_WAIT_TIME_RANGE_MESSAGE,
} from '@/lib/wait-time-contract';
import {
  clearPendingRideSaveCommand,
  createPendingRideSaveCommand,
  type PendingRideSaveCommand,
  persistPendingRideSaveCommand,
  restorePendingRideSaveCommand,
  rideCommandData,
  rideSaveContext,
} from '@/lib/services/pending-ride-save-command';

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
  const [cleanupPending, setCleanupPending] = useState(false);
  const [error, setError] = useState('');
  const [discardAllowed, setDiscardAllowed] = useState(false);
  const [parkCatalogError, setParkCatalogError] = useState('');
  const [attractionCatalogError, setAttractionCatalogError] = useState('');
  const [parkCatalogLoading, setParkCatalogLoading] = useState(false);
  const [attractionCatalogLoading, setAttractionCatalogLoading] = useState(false);
  const [parkCatalogRetry, setParkCatalogRetry] = useState(0);
  const [attractionCatalogRetry, setAttractionCatalogRetry] = useState(0);
  const savingRef = useRef(false);
  const pendingCommandRef = useRef<PendingRideSaveCommand | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PendingRideSaveCommand | null>(null);
  const pendingContext = rideSaveContext('manual');
  const dateKey = useMemo(() => toLocalDateKey(new Date(dateTime)), [dateTime]);
  const {
    tripId: activeTripId,
    tripName: activeTripName,
    recentParkId,
    setRecentParkId,
    loading: activeTripLoading,
    error: activeTripError,
    errorKind: activeTripErrorKind,
    retry: retryActiveTrip,
    continueStandalone,
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
    pendingCommandRef.current = null;
    setPendingCommand(null);
  }, []);

  // Load parks on mount
  useEffect(() => {
    setParkCatalogLoading(true);
    setParkCatalogError('');
    withReadDeadline(
      getCollection<{ name: string }>('parks'),
      'Parks could not be loaded. Retry before selecting a park.',
    ).then((docs) => {
      setParks(docs.map((d) => ({ id: d.id, name: d.name })));
    }).catch((readError: Error) => setParkCatalogError(readError.message))
      .finally(() => setParkCatalogLoading(false));
  }, [parkCatalogRetry]);

  // Load attractions when park changes
  useEffect(() => {
    if (!parkId) {
      setAttractions([]);
      setAttractionCatalogError('');
      setAttractionCatalogLoading(false);
      return;
    }
    let cancelled = false;
    setAttractions([]);
    setAttractionCatalogLoading(true);
    setAttractionCatalogError('');
    withReadDeadline(
      getCollection<{ name: string; entityType?: string }>('attractions', [whereConstraint('parkId', '==', parkId)]),
      'Attractions could not be loaded. Retry or choose another park.',
    ).then((docs) => {
      if (!cancelled) setAttractions(
        docs
          .filter((d) => !d.entityType || LOGGABLE_ENTITY_TYPES.has(d.entityType))
          .map((d) => ({ id: d.id, name: d.name, entityType: d.entityType }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    }).catch((readError: Error) => {
      if (!cancelled) setAttractionCatalogError(readError.message);
    }).finally(() => {
      if (!cancelled) setAttractionCatalogLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [attractionCatalogRetry, parkId]);

  useEffect(() => {
    if (!activeTripLoading && !pendingCommandRef.current) {
      resetParkSelection(recentParkId ?? '');
    }
  }, [activeTripLoading, dateKey, recentParkId, resetParkSelection]);

  useEffect(() => {
    if (!user?.uid) {
      pendingCommandRef.current = null;
      setPendingCommand(null);
      return;
    }
    let cancelled = false;
    void restorePendingRideSaveCommand(user.uid, pendingContext).then((restored) => {
      if (cancelled || pendingCommandRef.current) return;
      pendingCommandRef.current = restored;
      setPendingCommand(restored);
      if (!restored) return;
      setParkId(restored.data.parkId);
      setAttractionId(restored.data.attractionId);
      setDateTime(formatDateTimeLocal(new Date(restored.data.rodeAt)));
      setWaitTime(restored.data.waitTimeMinutes === null ? '' : String(restored.data.waitTimeMinutes));
      setWaitTimeMode(restored.data.attractionClosed
        ? 'closed'
        : restored.data.waitTimeMinutes === null
          ? 'unknown'
          : restored.data.waitTimeMinutes === 0 ? 'no-wait' : 'manual');
      setRating(restored.data.rating);
      setCleanupPending(false);
      setError('This ride save was not confirmed. Retry will reconcile the same request.');
    });
    return () => {
      cancelled = true;
    };
  }, [pendingContext, user?.uid]);

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
    if (activeTripLoading || activeTripErrorKind === 'active-trip') {
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
    const command = pendingCommandRef.current ?? createPendingRideSaveCommand({
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
    }, activeTripId ?? null);
    if (!pendingCommandRef.current) {
      const persisted = await persistPendingRideSaveCommand(user.uid, pendingContext, command);
      if (!persisted.ok) {
        setError(pendingSaveStorageErrorMessage('save this ride', persisted));
        savingRef.current = false;
        setSaving(false);
        return;
      }
      pendingCommandRef.current = command;
      setPendingCommand(command);
    }

    const finishCommittedSave = async () => {
      setCleanupPending(true);
      const removed = await clearPendingRideSaveCommand(
        user.uid,
        pendingContext,
        command.requestId,
      );
      if (!removed.ok) {
        setError(
          `${pendingSaveRemovalErrorMessage('ride save', removed)} `
          + 'The ride is saved; use Finish Cleanup without submitting it again.',
        );
        return false;
      }
      pendingCommandRef.current = null;
      setPendingCommand(null);
      setCleanupPending(false);
      setError('');
      setRecentParkId(command.data.parkId);
      setSaved(true);
      onSuccess?.();
      return true;
    };

    try {
      if (cleanupPending) {
        await finishCommittedSave();
        return;
      }
      await createRideLog(user.uid, rideCommandData(command), command.tripId, {
        requestId: command.requestId,
        timeoutMs: RIDE_SAVE_TIMEOUT_MS,
      });
      await finishCommittedSave();
    } catch (saveError) {
      if (
        isConfirmedPartialSave(saveError)
      ) {
        await finishCommittedSave();
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
  const commandFrozen = pendingCommand !== null;
  const handleDiscardFailedSave = async () => {
    if (user && pendingCommandRef.current) {
      const removed = await clearPendingRideSaveCommand(
        user.uid,
        pendingContext,
        pendingCommandRef.current.requestId,
      );
      if (!removed.ok) {
        setError(pendingSaveRemovalErrorMessage('ride save', removed));
        return;
      }
    }
    pendingCommandRef.current = null;
    setPendingCommand(null);
    setError('');
    setDiscardAllowed(false);
    setSaved(false);
    setCleanupPending(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {activeTripError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>{activeTripError}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={retryActiveTrip} className="rounded-lg bg-amber-700 px-3 py-2 font-medium text-white">
              Retry active trip check
            </button>
            {activeTripErrorKind === 'active-trip' && (
              <button type="button" onClick={continueStandalone} className="rounded-lg border border-amber-400 bg-white px-3 py-2 font-medium">
                Log standalone
              </button>
            )}
          </div>
        </div>
      )}
      {parkCatalogError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>{parkCatalogError}</p>
          <button
            type="button"
            onClick={() => setParkCatalogRetry((value) => value + 1)}
            className="mt-2 rounded-lg bg-amber-700 px-3 py-2 font-medium text-white"
          >
            Retry park loading
          </button>
        </div>
      )}
      {attractionCatalogError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>{attractionCatalogError}</p>
          <button
            type="button"
            onClick={() => setAttractionCatalogRetry((value) => value + 1)}
            className="mt-2 rounded-lg bg-amber-700 px-3 py-2 font-medium text-white"
          >
            Retry attraction loading
          </button>
        </div>
      )}
      {commandFrozen && pendingCommand && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Pending save for {pendingCommand.data.attractionName}</p>
          <p>
            {pendingCommand.data.parkName || pendingCommand.data.parkId}
            {' · '}
            {pendingCommand.data.waitTimeMinutes === null
              ? 'Unknown wait'
              : `${pendingCommand.data.waitTimeMinutes} min wait`}
            {' · '}
            {new Date(pendingCommand.data.rodeAt).toLocaleString()}
          </p>
        </div>
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
        {parks.length === 0 && !parkCatalogError && (
          <p className="mt-2 text-xs text-primary-500">
            {parkCatalogLoading ? 'Loading parks…' : 'No parks are available. Retry park loading.'}
          </p>
        )}
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
        {parkId && attractions.length === 0 && !attractionCatalogError && (
          <p className="mt-2 text-xs text-primary-500">
            {attractionCatalogLoading
              ? 'Loading attractions…'
              : 'No attractions are available. Retry attraction loading.'}
          </p>
        )}
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
          {saved
            ? 'Saved ✓'
            : saving
              ? (cleanupPending ? 'Finishing Cleanup...' : 'Saving...')
              : cleanupPending
                ? 'Finish Cleanup'
                : commandFrozen ? 'Retry Save' : 'Log Ride 🎢'}
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
