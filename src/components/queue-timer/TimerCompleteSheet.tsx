'use client';

import {
  pendingSaveRemovalErrorMessage,
  pendingSaveStorageErrorMessage,
} from '@/lib/services/pending-save-command-storage';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Star, X } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import {
  createRideLog,
  canDiscardRideLogSave,
  RideLogSaveError,
  RIDE_LOG_SAVE_TIMEOUT_MS,
  submitCrowdReport,
} from '@/lib/services/ride-log-service';
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

interface TimerCompleteSheetProps {
  elapsedMinutes: number;
  attractionName: string;
  parkId: string;
  attractionId: string;
  parkName: string;
  onClose: () => void | Promise<void>;
}

const CLOSE_TIMEOUT_MS = 3_000;
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function withCloseTimeout(close: () => void | Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Close timed out')), CLOSE_TIMEOUT_MS);
  });

  return Promise.race([Promise.resolve().then(close), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Bottom sheet shown after timer stops.
 * Shows wait summary, optional rating/notes, and saves the ride log.
 */
export default function TimerCompleteSheet({
  elapsedMinutes,
  attractionName,
  parkId,
  attractionId,
  parkName,
  onClose,
}: TimerCompleteSheetProps) {
  const { user } = useAuth();
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [commandFrozen, setCommandFrozen] = useState(false);
  const [discardAllowed, setDiscardAllowed] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const saveConfirmedRef = useRef(false);
  const crowdReportSubmittedRef = useRef(false);
  const committedNoticeRef = useRef('');
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const restoreActionFocusRef = useRef(false);
  const saveCommandRef = useRef<PendingRideSaveCommand | null>(null);
  const commandOwnerUidRef = useRef<string | null>(null);
  const pendingContext = rideSaveContext('timer', `${parkId}:${attractionId}`);
  const normalizedElapsedMinutes = elapsedMinutes > 0 && elapsedMinutes < 2
    ? 2
    : elapsedMinutes;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();

    return () => {
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      if (saveCommandRef.current) {
        setError('Your session expired. Sign in to the same account to retry this pending ride save.');
      }
      return;
    }
    if (commandOwnerUidRef.current && commandOwnerUidRef.current !== user.uid) {
      saveCommandRef.current = null;
      commandOwnerUidRef.current = null;
      setCommandFrozen(false);
      setError('');
    }
    let cancelled = false;
    void restorePendingRideSaveCommand(user.uid, pendingContext).then((restored) => {
      if (cancelled || saveCommandRef.current) return;
      saveCommandRef.current = restored;
      commandOwnerUidRef.current = restored ? user.uid : null;
      setCommandFrozen(Boolean(restored));
      if (!restored) return;
      setRating(restored.data.rating);
      setNotes(restored.data.notes);
      setError('This ride save was not confirmed. Retry will reconcile the same request.');
    });
    return () => {
      cancelled = true;
    };
  }, [pendingContext, user?.uid]);

  useEffect(() => {
    if (saving || !restoreActionFocusRef.current) return;

    restoreActionFocusRef.current = false;
    const action = saveButtonRef.current ?? closeButtonRef.current;
    if (action && !action.disabled) {
      action.focus({ preventScroll: true });
    }
  }, [saving]);

  const closeAfterSave = async () => {
    try {
      await withCloseTimeout(onClose);
    } catch {
      setError('Ride saved, but this sheet could not close. Try Close again; your ride will not be duplicated.');
    }
  };

  const submitReportAfterConfirmedSave = () => {
    if (crowdReportSubmittedRef.current) return;
    crowdReportSubmittedRef.current = true;
    void submitCrowdReport({
      parkId,
      attractionId,
      waitTimeMinutes: normalizedElapsedMinutes,
    }).catch((reportError) => {
      console.warn('[TimerCompleteSheet] Ride saved; crowd report failed:', reportError);
    });
  };

  const focusSheetForPendingSave = () => {
    restoreActionFocusRef.current = true;
    sheetRef.current?.focus({ preventScroll: true });
  };

  const clearFrozenCommand = async () => {
    if (commandOwnerUidRef.current && saveCommandRef.current) {
      const removed = await clearPendingRideSaveCommand(
        commandOwnerUidRef.current,
        pendingContext,
        saveCommandRef.current.requestId,
      );
      if (!removed.ok) {
        setError(pendingSaveRemovalErrorMessage('ride save', removed));
        return false;
      }
    }
    saveCommandRef.current = null;
    commandOwnerUidRef.current = null;
    setCommandFrozen(false);
    return true;
  };

  const finishCommittedSave = async () => {
    const cleared = await clearFrozenCommand();
    if (!cleared) {
      setError((current) => (
        `${current} The ride is saved; use Finish Cleanup without saving it again.`
      ).trim());
      return false;
    }
    setError(committedNoticeRef.current);
    submitReportAfterConfirmedSave();
    await closeAfterSave();
    return true;
  };

  async function handleDismiss() {
    if (savingRef.current) {
      sheetRef.current?.focus({ preventScroll: true });
      return;
    }
    if (saveConfirmedRef.current) {
      await handleSave();
      return;
    }
    if (discardAllowed) {
      if (!await clearFrozenCommand()) return;
      await closeAfterSave();
      return;
    }
    if (commandFrozen) {
      await closeAfterSave();
      return;
    }
    await handleSave(true);
  }

  async function handleSave(skipExtras = false) {
    if (savingRef.current) {
      sheetRef.current?.focus({ preventScroll: true });
      return;
    }
    if (saveConfirmedRef.current) {
      focusSheetForPendingSave();
      savingRef.current = true;
      setSaving(true);
      setError('');
      try {
        await finishCommittedSave();
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
      return;
    }
    if (!user) {
      setError('Your session expired. Sign in again before saving this ride.');
      if (!saveCommandRef.current) setDiscardAllowed(true);
      return;
    }
    if (!isValidRideWaitTime(normalizedElapsedMinutes)) {
      setError(RIDE_WAIT_TIME_RANGE_MESSAGE);
      return;
    }

    focusSheetForPendingSave();
    savingRef.current = true;
    setSaving(true);
    setError('');
    if (!saveCommandRef.current) {
      saveCommandRef.current = createPendingRideSaveCommand({
          parkId,
          attractionId,
          parkName,
          attractionName,
          rodeAt: new Date(),
          waitTimeMinutes: normalizedElapsedMinutes,
          attractionClosed: false,
          source: 'timer',
          rating: skipExtras ? null : rating,
          notes: skipExtras ? '' : notes,
        }, undefined);
      const persisted = await persistPendingRideSaveCommand(
        user.uid,
        pendingContext,
        saveCommandRef.current,
      );
      if (!persisted.ok) {
        saveCommandRef.current = null;
        setError(pendingSaveStorageErrorMessage('save this ride', persisted));
        savingRef.current = false;
        setSaving(false);
        return;
      }
      commandOwnerUidRef.current = user.uid;
      setCommandFrozen(true);
    }
    const command = saveCommandRef.current;

    try {
      await createRideLog(user.uid, rideCommandData(command), command.tripId, {
        requestId: command.requestId,
        timeoutMs: RIDE_LOG_SAVE_TIMEOUT_MS,
        waitForTripStats: true,
      });

      saveConfirmedRef.current = true;
      setSaveConfirmed(true);
      committedNoticeRef.current = '';
      await finishCommittedSave();
    } catch (saveError) {
      if (
        saveError instanceof RideLogSaveError
        && saveError.code === 'post-write-refresh-failed'
        && saveError.savedLogId
      ) {
        saveConfirmedRef.current = true;
        setSaveConfirmed(true);
        committedNoticeRef.current = saveError.message;
        setError(saveError.message);
        await finishCommittedSave();
      } else {
        const definitiveFailure = canDiscardRideLogSave(saveError);
        if (definitiveFailure) await clearFrozenCommand();
        setDiscardAllowed(definitiveFailure);
        setError(
          saveError instanceof RideLogSaveError
            ? saveError.message
            : 'The ride could not be saved. Check your connection and try again.',
        );
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const getFocusableElements = (): HTMLElement[] => (
    Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
      .filter((element) => element.getAttribute('aria-hidden') !== 'true')
  );

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (savingRef.current) {
        sheetRef.current?.focus({ preventScroll: true });
        return;
      }
      void handleDismiss();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      sheetRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    if (event.shiftKey && (activeElement === first || !sheetRef.current?.contains(activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={saving ? undefined : () => void handleDismiss()}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="timer-complete-title"
        aria-busy={saving}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="relative w-full max-w-md animate-slide-up rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
      >
        {/* Close button */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={() => void handleDismiss()}
          disabled={saving}
          aria-label={
            saveConfirmed
              ? 'Close ride completion dialog'
              : discardAllowed
                ? 'Discard failed ride save and close'
              : commandFrozen && !saving
                ? 'Retry saving ride and close'
                : 'Save ride without rating or notes and close'
          }
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Celebration header */}
        <div className="mb-6 text-center">
          <div className="mb-2 text-4xl">🎢</div>
          <h2 id="timer-complete-title" className="text-xl font-bold text-primary-900">
            You waited {elapsedMinutes} minute{elapsedMinutes !== 1 ? 's' : ''}!
          </h2>
          <p className="mt-1 text-sm text-primary-500">for {attractionName}</p>
        </div>

        {/* Star rating */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-primary-700">
            How was the ride?
          </label>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star === rating ? null : star)}
                disabled={saving || saveConfirmed || commandFrozen}
                aria-label={`Rate ${star} out of 5 stars`}
                aria-pressed={rating === star}
                className="transition-transform hover:scale-110 active:scale-95"
              >
                <Star
                  className={`h-8 w-8 ${
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
        <div className="mb-6">
          <label htmlFor="ride-notes" className="mb-1 block text-sm font-medium text-primary-700">
            Notes (optional)
          </label>
          <textarea
            id="ride-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving || saveConfirmed || commandFrozen}
            placeholder="How was it? Front row? Any tips?"
            className="w-full resize-none rounded-xl border border-primary-200 px-4 py-3 text-sm placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            rows={3}
          />
        </div>

        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {saving ? (saveConfirmed ? 'Closing saved ride dialog.' : 'Saving ride.') : saveConfirmed ? 'Ride saved.' : ''}
        </div>

        {error && (
          <div
            role={saveConfirmed ? undefined : 'alert'}
            aria-live={saveConfirmed ? 'polite' : 'assertive'}
            className={`mb-4 rounded-xl px-4 py-3 text-sm ${
              saveConfirmed ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'
            }`}
          >
            {error}
          </div>
        )}

        {commandFrozen && saveCommandRef.current && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Pending save for {saveCommandRef.current.data.attractionName}</p>
            <p>
              {saveCommandRef.current.data.parkName || saveCommandRef.current.data.parkId}
              {' · '}
              {saveCommandRef.current.data.waitTimeMinutes === null
                ? 'Unknown wait'
                : `${saveCommandRef.current.data.waitTimeMinutes} min wait`}
              {' · '}
              {new Date(saveCommandRef.current.data.rodeAt).toLocaleString()}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {!saveConfirmed && (
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving || commandFrozen}
              className="flex-1 rounded-xl border border-primary-200 px-4 py-3 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50 disabled:opacity-50"
            >
              Skip
            </button>
          )}
          <button
            ref={saveButtonRef}
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50"
          >
            {
              saving
                ? (saveConfirmed ? 'Closing...' : 'Saving...')
                : saveConfirmed
                  ? commandFrozen ? 'Finish Cleanup' : 'Close'
                  : commandFrozen
                    ? 'Retry Save'
                    : 'Save 🎉'
            }
          </button>
        </div>
        {discardAllowed && !saveConfirmed && (
          <button
            type="button"
            onClick={() => void handleDismiss()}
            disabled={saving}
            className="mt-3 w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Discard failed save & close
          </button>
        )}
      </div>
    </div>
  );
}
