'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { createTrip } from '@/lib/services/trip-service';
import type { TripCreateData } from '@/types/trip';
import {
  loadPendingSaveCommand,
  pendingSaveRemovalErrorMessage,
  pendingSaveStorageErrorMessage,
  removePendingSaveCommand,
  storePendingSaveCommand,
} from '@/lib/services/pending-save-command-storage';

const TRIP_CREATE_UI_DEADLINE_MS = 12_000;
const TRIP_CREATE_SERVICE_TIMEOUT_MS = 30_000;
const TRIP_CREATE_CONTEXT = 'trip:create';

interface PendingTripCommand {
  requestId: string;
  data: TripCreateData;
}

function isPendingTripCommand(value: unknown): value is PendingTripCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const command = value as Partial<PendingTripCommand>;
  const data = command.data;
  return typeof command.requestId === 'string'
    && Boolean(data)
    && typeof data?.name === 'string'
    && typeof data.startDate === 'string'
    && typeof data.endDate === 'string'
    && Array.isArray(data.parkIds)
    && data.parkNames !== null
    && typeof data.parkNames === 'object'
    && ['planning', 'active', 'completed'].includes(data.status)
    && typeof data.notes === 'string';
}

class TripCreateUiDeadlineError extends Error {
  readonly outcome = 'ambiguous';

  constructor() {
    super(
      'Trip creation is taking longer than expected, so the result is not confirmed yet. '
      + 'Retry will reuse the same trip ID and will not create a duplicate trip.',
    );
    this.name = 'TripCreateUiDeadlineError';
  }
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `trip-${globalThis.crypto.randomUUID()}`;
  }
  return `trip-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function withTripCreateUiDeadline<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new TripCreateUiDeadlineError()),
      TRIP_CREATE_UI_DEADLINE_MS,
    );
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export default function CreateTripPage() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const router = useRouter();

  const [tripName, setTripName] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  const pendingCommandRef = useRef<PendingTripCommand | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PendingTripCommand | null>(null);
  const [completedTripId, setCompletedTripId] = useState<string | null>(null);

  const setFrozenCommand = useCallback((command: PendingTripCommand | null) => {
    pendingCommandRef.current = command;
    setPendingCommand(command);
  }, []);

  useEffect(() => {
    if (!userId) return;
    setFrozenCommand(null);
    setCompletedTripId(null);
    let cancelled = false;
    void loadPendingSaveCommand(
      userId,
      TRIP_CREATE_CONTEXT,
      isPendingTripCommand,
    ).then((restored) => {
      if (cancelled || pendingCommandRef.current) return;
      if (!restored) {
        setTripName('');
        setStartDate(new Date().toISOString().split('T')[0]);
        setError('');
        return;
      }
      setFrozenCommand(restored);
      setTripName(restored.data.name);
      setStartDate(restored.data.startDate);
      setError('This trip creation was not confirmed. Retry will reconcile the same request.');
    });
    return () => {
      cancelled = true;
    };
  }, [setFrozenCommand, userId]);

  // Auto-suggest name from date
  const suggestedName = (() => {
    const d = new Date(startDate + 'T00:00:00');
    return `Trip · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  })();

  const handleSubmit = async () => {
    if (!user) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    const command: PendingTripCommand = pendingCommand ?? {
      requestId: createRequestId(),
      data: {
        name: tripName.trim() || suggestedName,
        startDate,
        endDate: startDate,
        parkIds: [],
        parkNames: {},
        status: 'active',
        notes: '',
      },
    };
    if (!pendingCommand) {
      const persisted = await storePendingSaveCommand(
        user.uid,
        TRIP_CREATE_CONTEXT,
        command,
      );
      if (!persisted.ok) {
        setError(pendingSaveStorageErrorMessage('create this trip', persisted));
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
      setFrozenCommand(command);
    }
    const requestId = command.requestId;
    const commandOwnerUid = user.uid;
    try {
      if (completedTripId) {
        await completeTrip(completedTripId);
        return;
      }
      const createPromise = createTrip(user.uid, command.data, {
        requestId,
        timeoutMs: TRIP_CREATE_SERVICE_TIMEOUT_MS,
      });
      async function completeTrip(tripId: string) {
        if (pendingCommandRef.current?.requestId !== requestId) return;
        setCompletedTripId(tripId);
        const removed = await removePendingSaveCommand(
          commandOwnerUid,
          TRIP_CREATE_CONTEXT,
          requestId,
        );
        if (!removed.ok) {
          setError(
            `${pendingSaveRemovalErrorMessage('trip creation', removed)} `
            + 'The trip is created; use Finish Cleanup without creating it again.',
          );
          return;
        }
        setFrozenCommand(null);
        setCompletedTripId(null);
        router.push(`/trips/${tripId}`);
      }
      try {
        await completeTrip(await withTripCreateUiDeadline(createPromise));
      } catch (createError) {
        if (createError instanceof TripCreateUiDeadlineError) {
          void createPromise.then(completeTrip, () => {});
        }
        throw createError;
      }
    } catch (err) {
      console.error('Failed to create trip:', err);
      const outcome = err && typeof err === 'object' && 'outcome' in err
        ? err.outcome
        : 'ambiguous';
      if (outcome === 'definitive-non-commit') {
        const removed = await removePendingSaveCommand(
          user.uid,
          TRIP_CREATE_CONTEXT,
          requestId,
        );
        if (removed.ok) setFrozenCommand(null);
        else setError(pendingSaveRemovalErrorMessage('trip creation', removed));
      }
      setError(
        err instanceof Error
          ? err.message
          : 'Trip creation was not confirmed. Retry will reuse the same trip ID.',
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const commandFrozen = pendingCommand !== null;

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
          <label htmlFor="trip-name" className="block text-sm font-medium text-primary-700 mb-1">Trip Name</label>
          <input
            id="trip-name"
            type="text"
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            disabled={commandFrozen}
            placeholder={suggestedName}
            className="w-full rounded-lg border border-primary-200 px-4 py-3 text-sm text-primary-900 placeholder:text-primary-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <p className="mt-1 text-xs text-primary-400">Leave blank to use &ldquo;{suggestedName}&rdquo;</p>
        </div>

        {/* Start Date */}
        <div>
          <label htmlFor="trip-start-date" className="block text-sm font-medium text-primary-700 mb-1">Start Date (optional)</label>
          <input
            id="trip-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker()}
            disabled={commandFrozen}
            className="w-full rounded-lg border border-primary-200 px-4 py-3 text-sm text-primary-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3.5 text-base font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {submitting
            ? (completedTripId ? 'Finishing Cleanup...' : 'Creating...')
            : completedTripId
              ? 'Finish Cleanup'
              : commandFrozen ? 'Retry Create Trip' : 'Start Trip →'}
        </button>
      </div>
    </div>
  );
}
