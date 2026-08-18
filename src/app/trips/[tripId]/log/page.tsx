'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, X, Star, Timer, Clock, ChevronLeft, MapPin, Utensils } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { getTrip } from '@/lib/services/trip-service';
import {
  pendingSaveRemovalErrorMessage,
  pendingSaveStorageErrorMessage,
} from '@/lib/services/pending-save-command-storage';
import {
  canDiscardRideLogSave,
  createRideLog,
} from '@/lib/services/ride-log-service';
import { addDiningLog } from '@/lib/services/dining-log-service';
import { getCollection, whereConstraint } from '@/lib/firebase/firestore';
import { withReadDeadline } from '@/lib/services/bounded-read';
import type { Trip } from '@/types/trip';
import type { AttractionType } from '@/types/attraction';
import type { MealType } from '@/types/dining-log';
import { getAttractionIcon } from '@/lib/utils/attraction-icons';
import { classifyAttraction } from '@/lib/utils/classify-attraction';
import WaitTimeInput from '@/components/ride-log/WaitTimeInput';
import { toLocalDateKey, useActiveRidePark } from '@/hooks/useActiveRidePark';
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

interface AttractionOption {
  id: string;
  name: string;
  entityType?: string;
  attractionType?: AttractionType | null;
  effectiveType: AttractionType;
}

type LogMode = 'quick' | 'timer';

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'thrill', label: '🎢 Thrill' },
  { value: 'family', label: '👨‍👩‍👧 Family' },
  { value: 'show', label: '🎭 Show' },
  { value: 'experience', label: '✨ Experience' },
  { value: 'character-meet', label: '🤝 Characters' },
  { value: 'dining', label: '🍽️ Dining' },
];

const LOGGABLE_ENTITY_TYPES = new Set(['ATTRACTION', 'RIDE', 'SHOW', 'MEET_AND_GREET']);
const RESTAURANT_ENTITY_TYPES = new Set(['RESTAURANT']);
const RIDE_SAVE_TIMEOUT_MS = 30_000;
const RIDE_SAVE_UI_DEADLINE_MS = 12_000;

const MEAL_TYPES: { value: MealType; label: string; icon: string }[] = [
  { value: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { value: 'lunch', label: 'Lunch', icon: '☀️' },
  { value: 'dinner', label: 'Dinner', icon: '🌙' },
  { value: 'snack', label: 'Snack', icon: '🍿' },
];

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function pendingRideContext(tripId: string): string {
  return rideSaveContext('trip', tripId);
}

function isConfirmedPartialSave(error: unknown): error is Error & { savedLogId: string } {
  return error instanceof Error
    && 'code' in error
    && error.code === 'post-write-refresh-failed'
    && 'savedLogId' in error
    && typeof error.savedLogId === 'string';
}

class RideSaveUiDeadlineError extends Error {
  readonly code = 'ui-timeout';
  readonly outcome = 'ambiguous';

  constructor() {
    super(
      'Saving is taking longer than expected, so the result is not confirmed yet. '
      + 'Retry will reuse this save request and will not create a duplicate ride log.',
    );
    this.name = 'RideSaveUiDeadlineError';
  }
}

function withRideSaveUiDeadline<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RideSaveUiDeadlineError()), RIDE_SAVE_UI_DEADLINE_MS);
  });

  return Promise.race([promise, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function rideSaveErrorMessage(error: unknown): string {
  if (
    error instanceof Error
    && (
      ('code' in error && (error.code === 'timeout' || error.code === 'ui-timeout'))
      || /timed? out|too long/i.test(error.message)
    )
  ) {
    return error.message;
  }
  return 'Failed to save ride log. Please try again.';
}

export default function TripLogRidePage() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const { tripId } = useParams<{ tripId: string }>();
  const router = useRouter();

  const [trip, setTrip] = useState<(Trip & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [attractions, setAttractions] = useState<AttractionOption[]>([]);
  const [parkId, setParkId] = useState('');
  const [availableParks, setAvailableParks] = useState<{ id: string; name: string }[]>([]);
  const [parkSearchQuery, setParkSearchQuery] = useState('');
  const [tripReadError, setTripReadError] = useState('');
  const [tripReadRetry, setTripReadRetry] = useState(0);
  const [parkCatalogLoading, setParkCatalogLoading] = useState(false);
  const [parkCatalogError, setParkCatalogError] = useState('');
  const [parkCatalogRetry, setParkCatalogRetry] = useState(0);
  const [attractionCatalogLoading, setAttractionCatalogLoading] = useState(false);
  const [attractionCatalogError, setAttractionCatalogError] = useState('');
  const [attractionCatalogRetry, setAttractionCatalogRetry] = useState(0);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Ride log form state
  const [selectedAttraction, setSelectedAttraction] = useState<AttractionOption | null>(null);
  const [logMode, setLogMode] = useState<LogMode>('quick');
  const [waitTime, setWaitTime] = useState('');
  const [waitTimeMode, setWaitTimeMode] = useState<import('@/components/ride-log/WaitTimeInput').WaitTimeMode>('unknown');
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [discardAllowed, setDiscardAllowed] = useState(false);
  const [pendingRideCommand, setPendingRideCommand] = useState<PendingRideSaveCommand | null>(null);
  const [committedCleanup, setCommittedCleanup] = useState<{ partial: boolean } | null>(null);

  // Dining log form state
  const [selectedRestaurant, setSelectedRestaurant] = useState<AttractionOption | null>(null);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [diningRating, setDiningRating] = useState<number | null>(null);
  const [diningNotes, setDiningNotes] = useState('');
  const [hadReservation, setHadReservation] = useState<boolean | null>(null);
  const [tableWait, setTableWait] = useState('');
  const [tableWaitUnknown, setTableWaitUnknown] = useState(true);
  const [diningSaving, setDiningSaving] = useState(false);
  const [diningError, setDiningError] = useState('');

  // Timer state
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [timerElapsed, setTimerElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savingRef = useRef(false);
  const pendingRideCommandRef = useRef<PendingRideSaveCommand | null>(null);
  const parkSelectionTouchedRef = useRef(false);
  const parkCatalogRequestRef = useRef(0);
  const attractionCatalogRequestRef = useRef(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    recentParkId,
    setRecentParkId,
    loading: rideParkLoading,
    error: rideParkError,
    retry: retryRidePark,
  } = useActiveRidePark({
    enabled: Boolean(user && tripId),
    userId: user?.uid,
    tripId,
    tripName: trip?.name,
    dateKey: toLocalDateKey(),
  });
  const setFrozenRideCommand = useCallback((command: PendingRideSaveCommand | null) => {
    pendingRideCommandRef.current = command;
    setPendingRideCommand(command);
  }, []);
  const resetParkSelection = useCallback((nextParkId: string, userInitiated = false) => {
    if (pendingRideCommandRef.current) return;
    if (userInitiated) parkSelectionTouchedRef.current = true;
    setParkId(nextParkId);
    setSelectedAttraction(null);
    setSelectedRestaurant(null);
    setAttractions([]);
    setAttractionCatalogLoading(Boolean(nextParkId));
    setAttractionCatalogError('');
    setSearchQuery('');
    setError('');
    setDiscardAllowed(false);
  }, []);

  useEffect(() => {
    if (!userId || !tripId) return;
    setFrozenRideCommand(null);
    setCommittedCleanup(null);
    setSelectedAttraction(null);
    setError('');
    let cancelled = false;
    void restorePendingRideSaveCommand(userId, pendingRideContext(tripId)).then((restored) => {
      if (
        cancelled
        || pendingRideCommandRef.current
        || !restored
        || restored.tripId !== tripId
      ) return;
      setFrozenRideCommand(restored);
      setParkId(restored.data.parkId);
      setSelectedAttraction({
        id: restored.data.attractionId,
        name: restored.data.attractionName,
        effectiveType: classifyAttraction(restored.data.attractionName),
      });
      setLogMode(restored.data.source === 'timer' ? 'timer' : 'quick');
      setWaitTime(restored.data.waitTimeMinutes === null
        ? ''
        : String(restored.data.waitTimeMinutes));
      setWaitTimeMode(restored.data.attractionClosed
        ? 'closed'
        : restored.data.waitTimeMinutes === null
          ? 'unknown'
          : restored.data.waitTimeMinutes === 0
            ? 'no-wait'
            : 'manual');
      setRating(restored.data.rating);
      setNotes(restored.data.notes);
      setError('This ride save was not confirmed. Retry will reconcile the same request.');
    });
    return () => {
      cancelled = true;
    };
  }, [setFrozenRideCommand, tripId, userId]);

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/signin');
    }
  }, [authLoading, user, router]);

  // Load trip data. Park defaulting is scoped separately to this trip/day.
  useEffect(() => {
    if (!user || !tripId) return;
    setLoading(true);
    setTripReadError('');
    withReadDeadline(
      getTrip(user.uid, tripId),
      'The trip could not be loaded. Check your connection and retry.',
    )
      .then((t) => {
        setTrip(t);
      })
      .catch((readError: Error) => {
        setTripReadError(readError.message);
        setTrip(null);
      })
      .finally(() => setLoading(false));
  }, [tripReadRetry, user, tripId]);

  useEffect(() => {
    if (!trip || parkSelectionTouchedRef.current) return;
    if (recentParkId) {
      if (parkId !== recentParkId) resetParkSelection(recentParkId);
      return;
    }
    if (!rideParkLoading && !parkId && (trip.parkIds ?? []).length > 0) {
      resetParkSelection((trip.parkIds ?? [])[0]);
    }
  }, [parkId, recentParkId, resetParkSelection, rideParkLoading, trip]);

  // Load available parks from Firestore (for park picker when trip has no pre-assigned parks)
  useEffect(() => {
    if (!user) return;
    const requestId = ++parkCatalogRequestRef.current;
    setParkCatalogLoading(true);
    setParkCatalogError('');
    withReadDeadline(
      getCollection<{ name: string }>('parks', []),
      'Parks could not be loaded. Retry or use a park already assigned to this trip.',
    ).then((docs) => {
      if (parkCatalogRequestRef.current !== requestId) return;
      setAvailableParks(
        docs.map((d) => ({ id: d.id, name: d.name })).sort((a, b) => a.name.localeCompare(b.name))
      );
    }).catch((readError: Error) => {
      if (parkCatalogRequestRef.current === requestId) {
        setParkCatalogError(readError.message);
      }
    }).finally(() => {
      if (parkCatalogRequestRef.current === requestId) setParkCatalogLoading(false);
    });
    return () => {
      if (parkCatalogRequestRef.current === requestId) {
        parkCatalogRequestRef.current += 1;
      }
    };
  }, [parkCatalogRetry, user]);

  // Load attractions when park changes
  useEffect(() => {
    if (!parkId) {
      attractionCatalogRequestRef.current += 1;
      setAttractions([]);
      setAttractionCatalogLoading(false);
      setAttractionCatalogError('');
      return;
    }
    const requestId = ++attractionCatalogRequestRef.current;
    setAttractions([]);
    setAttractionCatalogLoading(true);
    setAttractionCatalogError('');
    withReadDeadline(getCollection<{ name: string; entityType?: string; attractionType?: AttractionType | null }>(
      'attractions',
      [whereConstraint('parkId', '==', parkId)],
    ), 'Attractions could not be loaded. Retry or choose another park.').then((docs) => {
      if (attractionCatalogRequestRef.current === requestId) setAttractions(
        docs
          .map((d) => ({
            id: d.id,
            name: d.name,
            entityType: d.entityType,
            attractionType: d.attractionType,
            effectiveType: d.attractionType ?? classifyAttraction(d.name, d.entityType),
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    }).catch((readError: Error) => {
      if (attractionCatalogRequestRef.current === requestId) {
        setAttractionCatalogError(readError.message);
      }
    }).finally(() => {
      if (attractionCatalogRequestRef.current === requestId) {
        setAttractionCatalogLoading(false);
      }
    });
    return () => {
      if (attractionCatalogRequestRef.current === requestId) {
        attractionCatalogRequestRef.current += 1;
      }
    };
  }, [attractionCatalogRetry, parkId]);

  const handleParkChange = (nextParkId: string) => {
    resetParkSelection(nextParkId, true);
  };

  // Timer tick
  useEffect(() => {
    if (timerStart !== null) {
      timerRef.current = setInterval(() => {
        setTimerElapsed(Date.now() - timerStart);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimerElapsed(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerStart]);

  // Filter attractions (includes restaurants when dining filter is active)
  const filteredAttractions = useMemo(() => {
    if (typeFilter === 'dining') {
      return attractions.filter((a) => {
        if (!a.entityType || !RESTAURANT_ENTITY_TYPES.has(a.entityType)) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!a.name.toLowerCase().includes(q)) return false;
        }
        return true;
      });
    }
    return attractions.filter((a) => {
      // Exclude non-loggable entity types (restaurants, merchandise, etc.)
      if (a.entityType && !LOGGABLE_ENTITY_TYPES.has(a.entityType)) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!a.name.toLowerCase().includes(q)) return false;
      }
      if (typeFilter !== 'all') {
        if (typeFilter === 'show') {
          if (a.effectiveType !== 'show') return false;
        } else if (typeFilter === 'character-meet') {
          if (a.effectiveType !== 'character-meet') return false;
        } else {
          if (a.effectiveType !== typeFilter) return false;
        }
      }
      return true;
    });
  }, [attractions, searchQuery, typeFilter]);

  const handleSelectAttraction = useCallback((attraction: AttractionOption) => {
    if (attraction.entityType && RESTAURANT_ENTITY_TYPES.has(attraction.entityType)) {
      setSelectedRestaurant(attraction);
      setMealType('lunch');
      setDiningRating(null);
      setDiningNotes('');
      setHadReservation(null);
      setTableWait('');
      setTableWaitUnknown(true);
      setDiningError('');
      return;
    }
    setSelectedAttraction(attraction);
    setLogMode('quick');
    setWaitTime('');
    setWaitTimeMode('unknown');
    setRating(null);
    setNotes('');
    setError('');
    setTimerStart(null);
  }, []);

  const handleStartTimer = () => {
    setTimerStart(Date.now());
    setLogMode('timer');
  };

  const handleStopTimer = () => {
    if (timerStart) {
      const elapsed = Date.now() - timerStart;
      const minutes = Math.round(elapsed / 60000);
      setWaitTime(minutes.toString());
      setTimerStart(null);
    }
  };

  const handleSubmit = async () => {
    if (!user || !trip || !selectedAttraction) return;
    if (savingRef.current) return;
    const rideWaitTime = pendingRideCommand?.data.waitTimeMinutes ?? (waitTimeMode === 'closed'
      ? null
      : waitTime
        ? Number(waitTime)
        : null);
    if (!isValidRideWaitTime(rideWaitTime)) {
      setError(RIDE_WAIT_TIME_RANGE_MESSAGE);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError('');
    setDiscardAllowed(false);
    const parkName = (trip.parkNames ?? {})[parkId] || availableParks.find((p) => p.id === parkId)?.name || '';
    const command = pendingRideCommand ?? createPendingRideSaveCommand({
        parkId,
        attractionId: selectedAttraction.id,
        parkName,
        attractionName: selectedAttraction.name,
        rodeAt: new Date(),
        waitTimeMinutes: rideWaitTime,
        attractionClosed: waitTimeMode === 'closed',
        source: logMode === 'timer' ? 'timer' : 'manual',
        rating,
        notes,
      }, tripId);
    if (!pendingRideCommand) {
        const persisted = await persistPendingRideSaveCommand(
          user.uid,
          pendingRideContext(tripId),
          command,
        );
        if (!persisted.ok) {
          setError(pendingSaveStorageErrorMessage('save this ride', persisted));
          savingRef.current = false;
          setSaving(false);
          return;
        }
        setFrozenRideCommand(command);
      }
    const requestId = command.requestId;
    const attractionName = command.data.attractionName;
    const completeSave = async (partial: boolean) => {
      if (pendingRideCommandRef.current?.requestId !== requestId) return;
      setCommittedCleanup({ partial });
      const removed = await clearPendingRideSaveCommand(
        user.uid,
        pendingRideContext(tripId),
        requestId,
      );
      if (!removed.ok) {
        setError(
          `${pendingSaveRemovalErrorMessage('ride save', removed)} `
          + 'The ride is saved; use Finish Cleanup without submitting it again.',
        );
        return;
      }
      setRecentParkId(command.data.parkId);
      setSuccessMessage(
        partial
          ? `${attractionName} logged! Trip totals may take a moment to refresh.`
          : `${attractionName} logged! 🎉`,
      );
      setSelectedAttraction(null);
      setWaitTime('');
      setWaitTimeMode('unknown');
      setRating(null);
      setNotes('');
      setTimerStart(null);
      setFrozenRideCommand(null);
      setCommittedCleanup(null);
      setError('');
      setDiscardAllowed(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    };

    try {
      if (committedCleanup) {
        await completeSave(committedCleanup.partial);
        return;
      }
      const savePromise = createRideLog(
        user.uid,
        rideCommandData(command),
        command.tripId,
        {
          requestId,
          timeoutMs: RIDE_SAVE_TIMEOUT_MS,
          waitForTripStats: true,
        },
      );
      try {
        await withRideSaveUiDeadline(savePromise);
      } catch (saveError) {
        if (saveError instanceof RideSaveUiDeadlineError) {
          void savePromise.then(
            () => completeSave(false),
            (lateError) => {
              if (isConfirmedPartialSave(lateError)) void completeSave(true);
            },
          );
        }
        throw saveError;
      }
      await completeSave(false);
    } catch (saveError) {
      if (
        isConfirmedPartialSave(saveError)
      ) {
        await completeSave(true);
      } else {
        const discard = canDiscardRideLogSave(saveError);
        setDiscardAllowed(discard);
        if (discard) {
          const removed = await clearPendingRideSaveCommand(
            user.uid,
            pendingRideContext(tripId),
            requestId,
          );
          if (!removed.ok) {
            setError(pendingSaveRemovalErrorMessage('ride save', removed));
            return;
          }
          setFrozenRideCommand(null);
          setCommittedCleanup(null);
        }
        setError(rideSaveErrorMessage(saveError));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDiningSubmit = async () => {
    if (!user || !trip || !selectedRestaurant) return;

    setDiningSaving(true);
    setDiningError('');

    const parkName = (trip.parkNames ?? {})[parkId] || availableParks.find((p) => p.id === parkId)?.name || '';

    try {
      await addDiningLog(
        user.uid,
        {
          parkId,
          restaurantId: selectedRestaurant.id,
          parkName,
          restaurantName: selectedRestaurant.name,
          diningAt: new Date(),
          mealType,
          rating: diningRating,
          notes: diningNotes,
          hadReservation,
          tableWaitMinutes: tableWaitUnknown ? null : (tableWait ? parseInt(tableWait, 10) : null),
        },
        tripId,
      );
      setSuccessMessage(`${selectedRestaurant.name} logged! 🍽️`);
      setSelectedRestaurant(null);
      setMealType('lunch');
      setDiningRating(null);
      setDiningNotes('');
      setHadReservation(null);
      setTableWait('');
      setTableWaitUnknown(true);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch {
      setDiningError('Failed to save dining log. Please try again.');
    } finally {
      setDiningSaving(false);
    }
  };

  const handleClosePanel = () => {
    if (pendingRideCommandRef.current) {
      setError('Resume the pending save for this attraction before choosing another.');
      return;
    }
    if (timerStart) {
      const confirmed = window.confirm('Timer is running. Discard?');
      if (!confirmed) return;
    }
    setSelectedAttraction(null);
    setTimerStart(null);
  };
  const handleDiscardFailedSave = async () => {
    if (user && pendingRideCommandRef.current) {
      const removed = await clearPendingRideSaveCommand(
        user.uid,
        pendingRideContext(tripId),
        pendingRideCommandRef.current.requestId,
      );
      if (!removed.ok) {
        setError(pendingSaveRemovalErrorMessage('ride save', removed));
        return;
      }
    }
    setFrozenRideCommand(null);
    setCommittedCleanup(null);
    setError('');
    setDiscardAllowed(false);
    setSelectedAttraction(null);
    setWaitTime('');
    setWaitTimeMode('unknown');
    setRating(null);
    setNotes('');
    setTimerStart(null);
  };
  const commandFrozen = pendingRideCommand !== null;

  const handleCloseDiningPanel = () => {
    setSelectedRestaurant(null);
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
        <p className="text-primary-600">
          {tripReadError || 'Trip not found.'}
        </p>
        {tripReadError && (
          <button
            type="button"
            onClick={() => setTripReadRetry((value) => value + 1)}
            className="mt-4 rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Retry trip loading
          </button>
        )}
        <Link href="/trips" className="mt-4 inline-block text-sm text-primary-500 hover:underline">
          ← Back to Trips
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-4 sm:pb-8">
      {/* Trip Context Banner */}
      <div className="mb-4 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href={`/trips/${tripId}`}
              className="rounded-lg p-1 transition-colors hover:bg-white/20"
              aria-label="Back to trip"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-base font-bold">
                {typeFilter === 'dining' ? 'Log Dining 🍽️' : 'Log a Ride 🎢'}
              </h1>
              <p className="text-xs text-white/80">{trip.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-white/70">
            <MapPin className="h-3 w-3" />
            <span>{(trip.parkNames ?? {})[parkId] || availableParks.find((p) => p.id === parkId)?.name || 'Select park'}</span>
          </div>
        </div>
      </div>

      {/* Park selector */}
      {(trip.parkIds ?? []).length > 1 ? (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {(trip.parkIds ?? []).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => handleParkChange(id)}
                disabled={rideParkLoading || commandFrozen}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  parkId === id
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-primary-50 text-primary-600 hover:bg-primary-100'
                }`}
              >
                {(trip.parkNames ?? {})[id]}
              </button>
            ))}
          </div>
        </div>
      ) : !parkId ? (
        <div className="mb-4">
          <label className="block text-sm font-medium text-primary-700 mb-2">Which park are you at?</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
            <input
              type="text"
              placeholder="Search parks..."
              value={parkSearchQuery}
              onChange={(e) => setParkSearchQuery(e.target.value)}
              disabled={rideParkLoading || commandFrozen}
              className="w-full rounded-xl border border-primary-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-primary-100 bg-white shadow-sm divide-y divide-primary-50">
            {availableParks
              .filter((p) => !parkSearchQuery || p.name.toLowerCase().includes(parkSearchQuery.toLowerCase()))
              .map((park) => (
                <button
                  key={park.id}
                  type="button"
                  onClick={() => { handleParkChange(park.id); setParkSearchQuery(''); }}
                  disabled={rideParkLoading || commandFrozen}
                  className="w-full px-4 py-3 text-left text-sm font-medium text-primary-700 hover:bg-primary-50 transition-colors"
                >
                  {park.name}
                </button>
              ))}
            {availableParks.filter((p) => !parkSearchQuery || p.name.toLowerCase().includes(parkSearchQuery.toLowerCase())).length === 0 && (
              <p className="py-4 text-center text-sm text-primary-400">
                {parkCatalogLoading
                  ? 'Loading parks...'
                  : parkCatalogError
                    ? 'Parks are unavailable. Use Retry park loading.'
                    : availableParks.length === 0
                      ? 'No parks are available.'
                      : 'No parks match your search.'}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => handleParkChange('')}
            disabled={rideParkLoading || commandFrozen}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-100 transition-colors"
          >
            <MapPin className="h-3 w-3" />
            {availableParks.find((p) => p.id === parkId)?.name || (trip.parkNames ?? {})[parkId] || 'Unknown park'}
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Success toast */}
      {successMessage && (
        <div className="mb-4 animate-in fade-in slide-in-from-top-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-700 shadow-sm">
          {successMessage}
        </div>
      )}
      {rideParkError && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>{rideParkError}</p>
          <button
            type="button"
            onClick={retryRidePark}
            className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Retry trip ride lookup
          </button>
        </div>
      )}
      {parkCatalogError && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>{parkCatalogError}</p>
          <button
            type="button"
            onClick={() => setParkCatalogRetry((value) => value + 1)}
            className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Retry park loading
          </button>
        </div>
      )}
      {attractionCatalogError && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>{attractionCatalogError}</p>
          <button
            type="button"
            onClick={() => setAttractionCatalogRetry((value) => value + 1)}
            className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Retry attraction loading
          </button>
        </div>
      )}

      {/* ======================== UNIFIED LIST ======================== */}
      <>
        {/* Search bar */}
        {parkId && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={rideParkLoading}
              placeholder={typeFilter === 'dining' ? 'Search restaurants...' : 'Search rides & shows...'}
              className="w-full rounded-xl border border-primary-200 bg-white py-3 pl-10 pr-10 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-primary-400 hover:bg-primary-100 hover:text-primary-600"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Type filter chips */}
        {parkId && (
          <div className="mb-4 flex flex-wrap gap-2">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setTypeFilter(f.value)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  typeFilter === f.value
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'bg-primary-50 text-primary-600 hover:bg-primary-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Attractions / Restaurants list */}
        {parkId && !selectedAttraction && !selectedRestaurant && (
          <div className="divide-y divide-primary-50 rounded-xl border border-primary-100 bg-white shadow-sm">
            {filteredAttractions.length === 0 && (
              <p className="py-8 text-center text-sm text-primary-400">
                {attractionCatalogLoading
                  ? (typeFilter === 'dining' ? 'Loading restaurants...' : 'Loading attractions...')
                  : attractionCatalogError
                    ? (typeFilter === 'dining' ? 'Restaurants unavailable.' : 'Attractions unavailable.')
                    : attractions.length === 0
                      ? (typeFilter === 'dining' ? 'No restaurants are available.' : 'No attractions are available.')
                  : (typeFilter === 'dining' ? 'No restaurants match your search.' : 'No rides match your search.')}
              </p>
            )}
            {filteredAttractions.map((a) => {
              const isRestaurant = a.entityType && RESTAURANT_ENTITY_TYPES.has(a.entityType);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleSelectAttraction(a)}
                  disabled={rideParkLoading}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isRestaurant ? 'hover:bg-amber-50 active:bg-amber-100' : 'hover:bg-primary-50 active:bg-primary-100'
                  }`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isRestaurant ? 'bg-amber-50' : 'bg-coral-50'
                  } text-lg`}>
                    {isRestaurant
                      ? <Utensils className="h-5 w-5 text-amber-600" />
                      : getAttractionIcon(a.entityType, a.attractionType)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-primary-800">
                      {a.name}
                    </span>
                    {isRestaurant ? (
                      <span className="text-xs text-primary-400">Restaurant</span>
                    ) : a.attractionType ? (
                      <span className="text-xs capitalize text-primary-400">
                        {a.attractionType.replace('-', ' ')}
                      </span>
                    ) : null}
                  </div>
                  <div className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    isRestaurant ? 'bg-amber-50 text-amber-600' : 'bg-primary-50 text-primary-500'
                  }`}>
                    Log
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </>

      {/* No park selected — prompt is handled by inline park picker above */}

      {/* ======================== RIDE LOG PANEL ======================== */}
      {selectedAttraction && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleClosePanel}
          />

          {/* Panel */}
          <div className="relative w-full max-w-lg animate-in slide-in-from-bottom rounded-t-2xl bg-white px-5 pb-8 pt-4 shadow-xl sm:rounded-2xl sm:m-4">
            {/* Handle bar (mobile) */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-primary-200 sm:hidden" />

            {/* Header */}
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-primary-900">
                  {pendingRideCommand?.data.attractionName ?? selectedAttraction.name}
                </h2>
                <p className="text-xs text-primary-500">
                  {pendingRideCommand?.data.parkName
                    || (trip.parkNames ?? {})[pendingRideCommand?.data.parkId ?? parkId]
                    || pendingRideCommand?.data.parkId}
                  {pendingRideCommand && (
                    <>
                      {' · '}
                      {pendingRideCommand.data.waitTimeMinutes === null
                        ? 'Unknown wait'
                        : `${pendingRideCommand.data.waitTimeMinutes} min wait`}
                      {' · '}
                      {new Date(pendingRideCommand.data.rodeAt).toLocaleString()}
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClosePanel}
                disabled={commandFrozen}
                className="rounded-lg p-1.5 text-primary-400 hover:bg-primary-100 hover:text-primary-600"
                aria-label={commandFrozen ? 'Pending save must be resumed' : 'Close'}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            {/* Mode toggle */}
            <div className="mb-4 flex rounded-xl bg-primary-50 p-1">
              <button
                type="button"
                onClick={() => { setLogMode('quick'); setTimerStart(null); }}
                disabled={commandFrozen}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                  logMode === 'quick'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-primary-500 hover:text-primary-700'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                Quick Log
              </button>
              <button
                type="button"
                onClick={() => setLogMode('timer')}
                disabled={commandFrozen}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                  logMode === 'timer'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-primary-500 hover:text-primary-700'
                }`}
              >
                <Timer className="h-3.5 w-3.5" />
                Timer
              </button>
            </div>

            {/* Timer mode */}
            {logMode === 'timer' && (
              <div className="mb-4 rounded-xl border border-primary-100 bg-primary-50/50 p-4 text-center">
                <div className="mb-3 font-mono text-3xl font-bold text-primary-800">
                  {formatElapsed(timerElapsed)}
                </div>
                {timerStart === null ? (
                  <button
                    type="button"
                    onClick={handleStartTimer}
                    disabled={commandFrozen}
                    className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-green-600 active:scale-95"
                  >
                    <Timer className="h-4 w-4" />
                    Start Timer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopTimer}
                    disabled={commandFrozen}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-indigo-600 active:scale-95 animate-pulse"
                  >
                    <Timer className="h-4 w-4" />
                    Stop Timer
                  </button>
                )}
                {timerStart !== null && (
                  <p className="mt-2 text-xs text-primary-400">
                    Timing your wait... tap Stop when you board!
                  </p>
                )}
              </div>
            )}

            {/* Wait time input (quick mode or after timer stops) */}
            {(logMode === 'quick' || (logMode === 'timer' && timerStart === null && waitTime)) && (
              <div className="mb-4">
                <WaitTimeInput
                  value={waitTime}
                  onChange={setWaitTime}
                  mode={waitTimeMode}
                  onModeChange={setWaitTimeMode}
                  disabled={commandFrozen}
                />
              </div>
            )}

            {/* Rating */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-primary-600">
                Rating
              </label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star === rating ? null : star)}
                    disabled={commandFrozen}
                    className="transition-transform hover:scale-110 active:scale-90"
                    aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                  >
                    <Star
                      className={`h-8 w-8 ${
                        rating && star <= rating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-200'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="mb-5">
              <label htmlFor="log-notes" className="mb-1.5 block text-xs font-medium text-primary-600">
                Notes <span className="text-primary-300">(optional)</span>
              </label>
              <textarea
                id="log-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={commandFrozen}
                placeholder="Front row was amazing!"
                rows={2}
                className="w-full resize-none rounded-xl border border-primary-200 px-4 py-2.5 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || (logMode === 'timer' && timerStart !== null)}
              className="w-full rounded-xl bg-gradient-to-r from-coral-500 to-coral-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
            >
              {saving
                ? (committedCleanup ? 'Finishing Cleanup...' : 'Saving...')
                : timerStart !== null
                  ? 'Stop timer first'
                  : committedCleanup
                    ? 'Finish Cleanup'
                  : commandFrozen
                    ? 'Retry Save — Log Ride'
                    : 'Log Ride 🎢'}
            </button>
            {commandFrozen && error && discardAllowed && (
              <button
                type="button"
                onClick={handleDiscardFailedSave}
                className="mt-3 w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Discard failed save & start over
              </button>
            )}
          </div>
        </div>
      )}

      {/* ======================== DINING LOG PANEL ======================== */}
      {selectedRestaurant && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleCloseDiningPanel}
          />

          {/* Panel */}
          <div className="relative w-full max-w-lg animate-in slide-in-from-bottom rounded-t-2xl bg-white px-5 pb-8 pt-4 shadow-xl sm:rounded-2xl sm:m-4">
            {/* Handle bar (mobile) */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-amber-200 sm:hidden" />

            {/* Header */}
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                    <Utensils className="h-4.5 w-4.5 text-amber-600" />
                  </div>
                  <h2 className="text-lg font-bold text-primary-900">{selectedRestaurant.name}</h2>
                </div>
                <p className="ml-10 text-xs text-primary-500">{(trip.parkNames ?? {})[parkId]}</p>
              </div>
              <button
                type="button"
                onClick={handleCloseDiningPanel}
                className="rounded-lg p-1.5 text-primary-400 hover:bg-primary-100 hover:text-primary-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {diningError && (
              <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{diningError}</div>
            )}

            {/* Meal type selector */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-medium text-primary-600">
                Meal Type
              </label>
              <div className="grid grid-cols-4 gap-2">
                {MEAL_TYPES.map((meal) => (
                  <button
                    key={meal.value}
                    type="button"
                    onClick={() => setMealType(meal.value)}
                    className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-xs font-medium transition-all ${
                      mealType === meal.value
                        ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-300'
                        : 'bg-primary-50 text-primary-600 hover:bg-primary-100'
                    }`}
                  >
                    <span className="text-lg">{meal.icon}</span>
                    {meal.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reservation question */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-medium text-primary-600">
                Did you have a reservation? <span className="text-primary-300">(optional)</span>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setHadReservation(hadReservation === true ? null : true)}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    hadReservation === true
                      ? 'bg-indigo-100 text-indigo-800 ring-2 ring-indigo-300'
                      : 'bg-primary-50 text-primary-600 hover:bg-primary-100'
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setHadReservation(hadReservation === false ? null : false)}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    hadReservation === false
                      ? 'bg-indigo-100 text-indigo-800 ring-2 ring-indigo-300'
                      : 'bg-primary-50 text-primary-600 hover:bg-primary-100'
                  }`}
                >
                  No / Walk-up
                </button>
              </div>
            </div>

            {/* Table wait */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-primary-600">
                Wait for table <span className="text-primary-300">(optional)</span>
              </label>
              {!tableWaitUnknown && (
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="180"
                    value={tableWait}
                    onChange={(e) => setTableWait(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-primary-200 px-4 py-3 pr-14 text-lg font-medium focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-primary-400">
                    min
                  </span>
                </div>
              )}
              {tableWaitUnknown && (
                <div className="flex items-center justify-center rounded-xl border border-primary-100 bg-primary-50/50 px-4 py-3">
                  <span className="text-sm font-medium text-primary-400">Not tracked</span>
                </div>
              )}
              <label className="mt-2 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!tableWaitUnknown}
                  onChange={(e) => {
                    setTableWaitUnknown(!e.target.checked);
                    if (!e.target.checked) setTableWait('');
                  }}
                  className="h-4 w-4 rounded border-primary-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-primary-500">I remember how long I waited</span>
              </label>
            </div>

            {/* Rating */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-primary-600">
                How was your dining experience? <span className="text-primary-300">(optional)</span>
              </label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setDiningRating(star === diningRating ? null : star)}
                    className="transition-transform hover:scale-110 active:scale-90"
                    aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                  >
                    <Star
                      className={`h-8 w-8 ${
                        diningRating && star <= diningRating
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-gray-200'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Notes / what you had */}
            <div className="mb-5">
              <label htmlFor="dining-notes" className="mb-1.5 block text-xs font-medium text-primary-600">
                What did you have? <span className="text-primary-300">(optional)</span>
              </label>
              <textarea
                id="dining-notes"
                value={diningNotes}
                onChange={(e) => setDiningNotes(e.target.value)}
                placeholder="Turkey leg and a Dole Whip 🍦"
                rows={2}
                className="w-full resize-none rounded-xl border border-primary-200 px-4 py-2.5 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
              />
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleDiningSubmit}
              disabled={diningSaving}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
            >
              {diningSaving ? 'Saving...' : 'Log Dining 🍽️'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
