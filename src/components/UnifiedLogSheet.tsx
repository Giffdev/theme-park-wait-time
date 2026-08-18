'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, Search, Star, Check, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';
import { getCollection, whereConstraint } from '@/lib/firebase/firestore';
import { withReadDeadline } from '@/lib/services/bounded-read';
import {
  addRideLog,
  canDiscardRideLogSave,
} from '@/lib/services/ride-log-service';
import {
  getOrCreateWaitTimeReportCommand,
  submitWaitTimeReport,
} from '@/lib/firebase/waitTimeReports';
import {
  isValidReportedWaitTime,
  isValidRideWaitTime,
  RIDE_WAIT_TIME_RANGE_MESSAGE,
  WAIT_TIME_RANGE_MESSAGE,
} from '@/lib/wait-time-contract';
import { classifyAttraction } from '@/lib/utils/classify-attraction';
import { toLocalDateKey, useActiveRidePark } from '@/hooks/useActiveRidePark';
import WaitTimeInput from '@/components/ride-log/WaitTimeInput';
import type { WaitTimeMode } from '@/components/ride-log/WaitTimeInput';
import type { AttractionType } from '@/types/attraction';
import {
  pendingSaveRemovalErrorMessage,
  pendingSaveStorageErrorMessage,
} from '@/lib/services/pending-save-command-storage';
import {
  clearPendingRideSaveCommand,
  createPendingRideSaveCommand,
  type PendingRideSaveCommand,
  persistPendingRideSaveCommand,
  restorePendingRideSaveCommand,
  rideCommandData,
  rideSaveContext,
} from '@/lib/services/pending-ride-save-command';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParkOption {
  id: string;
  name: string;
}

interface AttractionOption {
  id: string;
  name: string;
  entityType?: string;
  attractionType?: AttractionType | null;
  effectiveType: AttractionType;
}

type SheetState = 'select' | 'form' | 'success';

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: 'thrill', label: '🎢 Thrill' },
  { value: 'family', label: '👨‍👩‍👧 Family' },
  { value: 'show', label: '🎭 Show' },
  { value: 'experience', label: '✨ Experience' },
  { value: 'character-meet', label: '🤝 Characters' },
];

const LOGGABLE_ENTITY_TYPES = new Set(['ATTRACTION', 'RIDE', 'SHOW', 'MEET_AND_GREET']);
const RIDE_SAVE_TIMEOUT_MS = 10_000;
const LAST_PARK_KEY = 'parkpulse-last-park';
const LEGACY_LAST_PARK_KEY = 'parkflow-last-park';

function isConfirmedPartialSave(error: unknown): error is Error & { savedLogId: string } {
  return error instanceof Error
    && 'code' in error
    && error.code === 'post-write-refresh-failed'
    && 'savedLogId' in error
    && typeof error.savedLogId === 'string';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface UnifiedLogSheetProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill with a specific park */
  initialParkId?: string;
  /** Pre-fill with a specific attraction (skips selection step) */
  initialAttractionId?: string;
  initialAttractionName?: string;
  /** Start with expanded ride-log section visible */
  expandedByDefault?: boolean;
  /** Callback on successful wait time report */
  onWaitTimeReported?: (waitTime: number) => void;
}

export default function UnifiedLogSheet({
  open,
  onClose,
  initialParkId,
  initialAttractionId,
  initialAttractionName,
  expandedByDefault = false,
  onWaitTimeReported,
}: UnifiedLogSheetProps) {
  const { user } = useAuth();

  // Sheet state
  const [sheetState, setSheetState] = useState<SheetState>('select');
  const [expanded, setExpanded] = useState(expandedByDefault);

  // Park & attraction
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [selectedParkId, setSelectedParkId] = useState('');
  const [attractions, setAttractions] = useState<AttractionOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedAttraction, setSelectedAttraction] = useState<AttractionOption | null>(null);

  // Form fields
  const [waitTime, setWaitTime] = useState('');
  const [waitTimeMode, setWaitTimeMode] = useState<WaitTimeMode>('unknown');
  const [rating, setRating] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [waitReportSucceeded, setWaitReportSucceeded] = useState(false);
  const [discardAllowed, setDiscardAllowed] = useState(false);
  const [parkCatalogError, setParkCatalogError] = useState<string | null>(null);
  const [attractionCatalogError, setAttractionCatalogError] = useState<string | null>(null);
  const [parkCatalogLoading, setParkCatalogLoading] = useState(false);
  const [attractionCatalogLoading, setAttractionCatalogLoading] = useState(false);
  const [parkCatalogRetry, setParkCatalogRetry] = useState(0);
  const [attractionCatalogRetry, setAttractionCatalogRetry] = useState(0);

  // Trip association
  const [standaloneMode, setStandaloneMode] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const pendingCommandRef = useRef<PendingRideSaveCommand | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PendingRideSaveCommand | null>(null);
  const selectedParkIdRef = useRef('');
  const pendingContext = rideSaveContext('unified');
  const {
    tripId: activeTripId,
    tripName: activeTripName,
    recentParkId,
    setRecentParkId,
    loading: tripLoading,
    error: tripLookupError,
    errorKind: tripLookupErrorKind,
    retry: retryTripLookup,
    continueStandalone,
  } = useActiveRidePark({
    enabled: open,
    userId: user?.uid,
    dateKey: toLocalDateKey(),
  });
  const tripCheckDone = !tripLoading;
  const resetParkSelection = useCallback((nextParkId: string) => {
    if (pendingCommandRef.current) return;
    selectedParkIdRef.current = nextParkId;
    setSelectedParkId(nextParkId);
    setSelectedAttraction(null);
    setSearchQuery('');
    setTypeFilter('');
    setAttractions([]);
    setError(null);
    setSuccessNotice(null);
    setWaitReportSucceeded(false);
    setDiscardAllowed(false);
  }, []);

  const setFrozenCommand = useCallback((command: PendingRideSaveCommand | null) => {
    pendingCommandRef.current = command;
    setPendingCommand(command);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!user?.uid) {
      setFrozenCommand(null);
      return;
    }
    let cancelled = false;
    void restorePendingRideSaveCommand(user.uid, pendingContext).then((restored) => {
      if (cancelled || pendingCommandRef.current) return;
      setFrozenCommand(restored);
      if (!restored) return;
      selectedParkIdRef.current = restored.data.parkId;
      setSelectedParkId(restored.data.parkId);
      setSelectedAttraction({
        id: restored.data.attractionId,
        name: restored.data.attractionName,
        effectiveType: classifyAttraction(restored.data.attractionName),
      });
      setWaitTime(restored.data.waitTimeMinutes === null ? '' : String(restored.data.waitTimeMinutes));
      setWaitTimeMode(restored.data.attractionClosed
        ? 'closed'
        : restored.data.waitTimeMinutes === null
          ? 'unknown'
          : restored.data.waitTimeMinutes === 0 ? 'no-wait' : 'manual');
      setRating(restored.data.rating ?? 0);
      setNotes(restored.data.notes);
      setExpanded(true);
      setSheetState('form');
      setCleanupPending(false);
      setError('This ride save was not confirmed. Retry will reconcile the same request.');
    });
    return () => {
      cancelled = true;
    };
  }, [open, pendingContext, setFrozenCommand, user?.uid]);

  // Sync expandedByDefault prop
  useEffect(() => {
    if (open && !pendingCommandRef.current) setExpanded(expandedByDefault);
  }, [open, expandedByDefault]);

  // Preserve the existing branding migration without using this global value
  // as a ride default; ride defaults are scoped to the active trip and day.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const legacy = localStorage.getItem(LEGACY_LAST_PARK_KEY);
    if (!legacy || localStorage.getItem(LAST_PARK_KEY)) return;
    try {
      localStorage.setItem(LAST_PARK_KEY, legacy);
      localStorage.removeItem(LEGACY_LAST_PARK_KEY);
    } catch {
      // Storage can be unavailable in private browsing.
    }
  }, [open]);

  // Load parks
  useEffect(() => {
    if (!open || !user?.uid) return;
    setParkCatalogLoading(true);
    setParkCatalogError(null);
    withReadDeadline(
      getCollection<{ name: string }>('parks', []),
      'Parks could not be loaded. Retry, or continue with the park already selected.',
    ).then((docs) => {
      setParks(docs.map((d) => ({ id: d.id, name: d.name })).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch((readError: Error) => setParkCatalogError(readError.message))
      .finally(() => setParkCatalogLoading(false));
  }, [open, parkCatalogRetry, user?.uid]);

  // Keep a specific attraction's park; otherwise prefer this trip/day's latest ride.
  useEffect(() => {
    if (!open || tripLoading) return;
    if (initialParkId && initialAttractionId) {
      if (selectedParkIdRef.current !== initialParkId) resetParkSelection(initialParkId);
      return;
    }
    const resolvedParkId = recentParkId ?? initialParkId ?? '';
    if (selectedParkIdRef.current !== resolvedParkId) resetParkSelection(resolvedParkId);
  }, [open, initialAttractionId, initialParkId, recentParkId, resetParkSelection, tripLoading]);

  // If attraction is pre-selected, jump to form
  useEffect(() => {
    if (!open || tripLoading || !initialAttractionId || !initialAttractionName) return;
    if (pendingCommandRef.current) return;
    setSelectedAttraction({
      id: initialAttractionId,
      name: initialAttractionName,
      effectiveType: 'thrill' as AttractionType,
    });
    setSheetState('form');
  }, [open, tripLoading, initialAttractionId, initialAttractionName]);

  // Load attractions when park changes
  useEffect(() => {
    if (!selectedParkId) { setAttractions([]); return; }
    let cancelled = false;
    setAttractions([]);
    setAttractionCatalogLoading(true);
    setAttractionCatalogError(null);
    withReadDeadline(getCollection<{ name: string; entityType?: string; attractionType?: AttractionType | null }>(
      'attractions',
      [whereConstraint('parkId', '==', selectedParkId)],
    ), 'Attractions could not be loaded. Retry or choose another park.').then((docs) => {
      if (!cancelled) setAttractions(
        docs
          .filter((d) => LOGGABLE_ENTITY_TYPES.has(d.entityType ?? ''))
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
      if (!cancelled) setAttractionCatalogError(readError.message);
    }).finally(() => {
      if (!cancelled) setAttractionCatalogLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [attractionCatalogRetry, selectedParkId]);

  const handleParkChange = (nextParkId: string) => {
    resetParkSelection(nextParkId);
  };

  // Filtered attractions
  const filteredAttractions = useMemo(() => {
    let result = attractions;
    if (typeFilter) {
      result = result.filter((a) => a.effectiveType === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((a) => a.name.toLowerCase().includes(q));
    }
    return result;
  }, [attractions, typeFilter, searchQuery]);
  const commandFrozen = pendingCommand !== null;

  // Handle attraction selection
  const handleSelectAttraction = (attraction: AttractionOption) => {
    setSelectedAttraction(attraction);
    setSheetState('form');
  };

  // Compute wait time value for the report
  const getReportWaitTime = useCallback((): number => {
    if (waitTimeMode === 'closed') return -1;
    if (waitTimeMode === 'no-wait') return 0;
    const parsed = Number(waitTime);
    return isNaN(parsed) ? -2 : parsed; // -2 sentinel for "unknown/not provided"
  }, [waitTime, waitTimeMode]);

  // Handle submission — ALWAYS reports wait time; optionally logs ride
  const handleSubmit = async () => {
    if (!user || !selectedAttraction || !selectedParkId) return;
    if (savingRef.current) return;
    setError(null);
    setSuccessNotice(null);
    setWaitReportSucceeded(false);
    setDiscardAllowed(false);

    const reportWait = getReportWaitTime();
    if (expanded && (tripLoading || tripLookupErrorKind === 'active-trip')) {
      setError(tripLookupError ?? 'Still checking for an active trip. Please wait.');
      return;
    }

    // Validate: we need a valid wait time (not unknown) for "report only" fast path
    if (!expanded && reportWait === -2) {
      setError('Enter a wait time to submit your report.');
      return;
    }

    if (reportWait !== -2 && !isValidReportedWaitTime(reportWait)) {
      setError(WAIT_TIME_RANGE_MESSAGE);
      return;
    }
    const rideWaitTime = waitTimeMode === 'closed'
      ? null
      : waitTime
        ? Number(waitTime)
        : null;
    if (expanded && !isValidRideWaitTime(rideWaitTime)) {
      setError(RIDE_WAIT_TIME_RANGE_MESSAGE);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const parkName = parks.find((p) => p.id === selectedParkId)?.name || '';

      if (expanded) {
        const command = pendingCommandRef.current ?? createPendingRideSaveCommand({
          parkId: selectedParkId,
          attractionId: selectedAttraction.id,
          parkName,
          attractionName: selectedAttraction.name,
          rodeAt: new Date(),
          waitTimeMinutes: rideWaitTime,
          attractionClosed: waitTimeMode === 'closed',
          source: 'manual',
          rating: rating || null,
          notes,
        }, activeTripId ?? null);
        if (!pendingCommandRef.current) {
          const persisted = await persistPendingRideSaveCommand(user.uid, pendingContext, command);
          if (!persisted.ok) {
            throw new Error(pendingSaveStorageErrorMessage('save this ride', persisted));
          }
          setFrozenCommand(command);
        }
        if (!cleanupPending) {
          try {
            await addRideLog(user.uid, rideCommandData(command), command.tripId, {
              requestId: command.requestId,
              timeoutMs: RIDE_SAVE_TIMEOUT_MS,
              waitForTripStats: true,
            });
          } catch (saveError) {
            if (
              !isConfirmedPartialSave(saveError)
            ) {
              setDiscardAllowed(canDiscardRideLogSave(saveError));
              throw saveError;
            }
            setSuccessNotice(saveError.message);
          }
        }
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
          return;
        }
        setCleanupPending(false);
        setFrozenCommand(null);
        setRecentParkId(command.data.parkId);
      }

      if (reportWait !== -2) {
        try {
          const reportCommand = getOrCreateWaitTimeReportCommand({
            accountId: user.uid,
            attractionId: selectedAttraction.id,
            attractionName: selectedAttraction.name,
            parkId: selectedParkId,
            waitTime: reportWait,
          });
          await submitWaitTimeReport(reportCommand);
          setWaitReportSucceeded(true);
          onWaitTimeReported?.(reportWait);
        } catch (reportError) {
          if (!expanded) throw reportError;
          setSuccessNotice('Ride saved. The community wait-time report could not be sent.');
        }
      }

      setSheetState('success');
    } catch (err) {
      console.error('Submission failed:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Reset for "Log Another"
  const handleLogAnother = async () => {
    setSelectedAttraction(null);
    setWaitTime('');
    setWaitTimeMode('unknown');
    setRating(0);
    setNotes('');
    setSearchQuery('');
    setError(null);
    setSuccessNotice(null);
    setWaitReportSucceeded(false);
    setDiscardAllowed(false);
    setCleanupPending(false);
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
    setFrozenCommand(null);
    setExpanded(expandedByDefault);
    setSheetState('select');
  };

  // Full reset on close
  const handleClose = () => {
    if (savingRef.current) return;
    if (pendingCommandRef.current) {
      onClose();
      return;
    }
    setSheetState('select');
    setSelectedAttraction(null);
    setWaitTime('');
    setWaitTimeMode('unknown');
    setRating(0);
    setNotes('');
    setSearchQuery('');
    setTypeFilter('');
    setExpanded(expandedByDefault);
    setStandaloneMode(false);
    setError(null);
    setSuccessNotice(null);
    setWaitReportSucceeded(false);
    setDiscardAllowed(false);
    setCleanupPending(false);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) handleClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  });

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
    setFrozenCommand(null);
    setError(null);
    setSuccessNotice(null);
    setWaitReportSucceeded(false);
    setDiscardAllowed(false);
    setSelectedAttraction(null);
    setWaitTime('');
    setWaitTimeMode('unknown');
    setRating(0);
    setNotes('');
    setSearchQuery('');
    setTypeFilter('');
    setSheetState('select');
  };

  if (!open) return null;

  // Auth gate
  if (!user) {
    return (
      <>
        <div
          className="fixed inset-0 z-[60] bg-black/40"
          onClick={handleClose}
        />
        <div className="fixed inset-x-0 bottom-0 z-[70] rounded-t-2xl bg-white shadow-2xl pb-[env(safe-area-inset-bottom)]">
          <div className="px-4 pt-6 pb-8 text-center">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-primary-200" />
            <div className="text-4xl mb-3">🎢</div>
            <h2 className="text-lg font-semibold text-primary-900 mb-2">Sign in to Continue</h2>
            <p className="text-sm text-primary-500 mb-5 max-w-xs mx-auto">Create an account or sign in to report wait times and log your rides.</p>
            <div className="flex gap-3 justify-center">
              <a href="/auth/signin" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">Sign In</a>
              <button onClick={handleClose} className="rounded-lg border border-primary-200 px-5 py-2.5 text-sm font-medium text-primary-700 hover:bg-primary-50">Cancel</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/40"
        onClick={saving ? undefined : handleClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-[70] max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl transition-transform duration-300 pb-[env(safe-area-inset-bottom)]">
        {/* Handle bar */}
        <div className="sticky top-0 z-10 bg-white pt-3 pb-2 px-4 border-b border-primary-100 rounded-t-2xl">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-primary-200" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary-900">
              {expanded ? 'Report & Log Ride' : 'Report Wait Time'}
            </h2>
            <button
              onClick={handleClose}
              disabled={saving}
              aria-label="Close log sheet"
              className="rounded-full p-2 text-primary-400 hover:bg-primary-50 hover:text-primary-600 disabled:opacity-40"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-4 py-4">
          {(parkCatalogError || attractionCatalogError) && (
            <div className="mb-4 space-y-2">
              {parkCatalogError && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <p>{parkCatalogError}</p>
                  <button
                    type="button"
                    onClick={() => setParkCatalogRetry((value) => value + 1)}
                    className="mt-2 rounded-md bg-amber-700 px-2 py-1.5 font-semibold text-white"
                  >
                    Retry park loading
                  </button>
                </div>
              )}
              {attractionCatalogError && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <p>{attractionCatalogError}</p>
                  <button
                    type="button"
                    onClick={() => setAttractionCatalogRetry((value) => value + 1)}
                    className="mt-2 rounded-md bg-amber-700 px-2 py-1.5 font-semibold text-white"
                  >
                    Retry attraction loading
                  </button>
                </div>
              )}
            </div>
          )}
          {/* ─── SELECT STATE ─── */}
          {sheetState === 'select' && (
            <>
              {tripLookupError && expanded && (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                  <p className="text-xs font-medium text-amber-800">{tripLookupError}</p>
                  <button
                    type="button"
                    onClick={retryTripLookup}
                    className="mt-2 rounded-md bg-amber-700 px-2 py-1.5 text-xs font-semibold text-white"
                  >
                    Retry trip check
                  </button>
                  {tripLookupErrorKind === 'active-trip' && (
                    <button
                      type="button"
                      onClick={() => {
                        continueStandalone();
                        setStandaloneMode(true);
                      }}
                      className="ml-2 mt-2 rounded-md border border-amber-400 bg-white px-2 py-1.5 text-xs font-semibold text-amber-800"
                    >
                      Log standalone
                    </button>
                  )}
                </div>
              )}
              {/* Park selector */}
              <div className="mb-4">
                <label htmlFor="active-park-select" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-primary-500">
                  Logging at
                </label>
                <select
                  id="active-park-select"
                  value={selectedParkId}
                  onChange={(e) => handleParkChange(e.target.value)}
                  disabled={tripLoading}
                  className="w-full rounded-lg border border-primary-200 px-3 py-2.5 text-sm text-primary-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Select a park...</option>
                  {parks.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {parks.length === 0 && !parkCatalogError && (
                  <p className="mt-2 text-xs text-primary-500">
                    {parkCatalogLoading ? 'Loading parks…' : 'No parks are available. Retry park loading.'}
                  </p>
                )}
              </div>

              {/* Search */}
              {selectedParkId && (
                <>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      disabled={tripLoading}
                      placeholder="Search attractions..."
                      className="w-full rounded-lg border border-primary-200 py-2.5 pl-9 pr-3 text-sm placeholder:text-primary-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  {/* Filter pills */}
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {TYPE_FILTERS.map((f) => (
                      <button
                        key={f.value}
                        onClick={() => setTypeFilter(typeFilter === f.value ? '' : f.value)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          typeFilter === f.value
                            ? 'bg-indigo-500 text-white'
                            : 'bg-primary-100 text-primary-600 hover:bg-primary-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Attraction list */}
                  <div className="max-h-[40vh] overflow-y-auto space-y-1">
                    {filteredAttractions.length === 0 && (
                      <p className="py-4 text-center text-sm text-primary-400">
                        {attractionCatalogLoading
                          ? 'Loading attractions…'
                          : attractionCatalogError
                            ? 'Attractions are unavailable. Use Retry attraction loading.'
                            : 'No attractions found'}
                      </p>
                    )}
                    {filteredAttractions.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => handleSelectAttraction(a)}
                        disabled={tripLoading}
                        className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-primary-800 hover:bg-primary-50 active:bg-primary-100 transition-colors"
                      >
                        <span className="font-medium">{a.name}</span>
                        <span className="text-primary-400">→</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ─── FORM STATE ─── */}
          {sheetState === 'form' && selectedAttraction && (
            <div className="space-y-4">
              {/* Selected attraction header */}
              <div className="rounded-lg bg-primary-50 px-3 py-2">
                {pendingCommand && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Pending save for {pendingCommand.data.attractionName}
                  </p>
                )}
                <p className="text-sm font-semibold text-primary-800">
                  {pendingCommand?.data.attractionName ?? selectedAttraction.name}
                </p>
                <p className="text-xs text-primary-500">
                  {pendingCommand?.data.parkName
                    || parks.find((p) => p.id === (pendingCommand?.data.parkId ?? selectedParkId))?.name
                    || pendingCommand?.data.parkId}
                  {pendingCommand && (
                    <>
                      {' · '}
                      {pendingCommand.data.waitTimeMinutes === null
                        ? 'Unknown wait'
                        : `${pendingCommand.data.waitTimeMinutes} min wait`}
                      {' · '}
                      {new Date(pendingCommand.data.rodeAt).toLocaleString()}
                    </>
                  )}
                </p>
              </div>

              {/* Wait time input — always visible */}
              <WaitTimeInput
                value={waitTime}
                onChange={setWaitTime}
                mode={waitTimeMode}
                onModeChange={setWaitTimeMode}
                disabled={commandFrozen}
              />

              {/* ─── Expand toggle: "I rode this" ─── */}
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                disabled={commandFrozen}
                className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium transition-all ${
                  expanded
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-primary-200 bg-white text-primary-700 hover:bg-primary-50'
                }`}
              >
                <span>{expanded ? 'I rode this ✓' : 'I also rode this →'}</span>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {/* ─── Expanded ride log fields ─── */}
              {expanded && (
                <div className="space-y-4 border-t border-primary-100 pt-4">
                  {/* Active trip banner (inline) */}
                  {activeTripId && activeTripName && (
                    <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-1.5">
                      <span className="text-xs">🗺️</span>
                      <span className="text-xs font-medium text-green-700">Adding to: <strong>{activeTripName}</strong></span>
                    </div>
                  )}

                  {tripLookupError && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                      <p className="text-xs font-medium text-amber-800">{tripLookupError}</p>
                      <button
                        type="button"
                        onClick={retryTripLookup}
                        className="mt-2 rounded-md bg-amber-700 px-2 py-1.5 text-xs font-semibold text-white"
                      >
                        Retry trip check
                      </button>
                      {tripLookupErrorKind === 'active-trip' && (
                        <button
                          type="button"
                          onClick={() => {
                            continueStandalone();
                            setStandaloneMode(true);
                          }}
                          className="ml-2 mt-2 rounded-md border border-amber-400 bg-white px-2 py-1.5 text-xs font-semibold text-amber-800"
                        >
                          Log standalone
                        </button>
                      )}
                    </div>
                  )}

                  {/* No active trip prompt (inline) */}
                  {tripCheckDone && !tripLookupError && !activeTripId && !standaloneMode && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin className="h-3.5 w-3.5 text-amber-600" />
                        <span className="text-xs font-semibold text-amber-800">No active trip</span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Link
                          href="/trips/new"
                          className="flex-1 rounded-md bg-indigo-600 px-2 py-1.5 text-center text-xs font-semibold text-white hover:bg-indigo-700"
                        >
                          Start Trip
                        </Link>
                        <button
                          onClick={() => setStandaloneMode(true)}
                          className="flex-1 rounded-md border border-amber-300 bg-white px-2 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50"
                        >
                          Standalone
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Standalone mode indicator — allows user to switch back */}
                  {tripCheckDone && !tripLookupError && !activeTripId && standaloneMode && (
                    <div className="flex items-center justify-between rounded-lg bg-primary-50 border border-primary-100 px-3 py-2">
                      <span className="text-xs text-primary-600">📍 Logging as standalone ride</span>
                      <button
                        type="button"
                        onClick={() => setStandaloneMode(false)}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Change
                      </button>
                    </div>
                  )}

                  {/* Rating */}
                  <div>
                    <label className="block text-sm font-medium text-primary-700 mb-1">Rating</label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRating(rating === n ? 0 : n)}
                          disabled={commandFrozen}
                          className="p-1 transition-transform active:scale-110"
                        >
                          <Star
                            className={`h-7 w-7 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-primary-200'}`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-primary-700 mb-1">Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={commandFrozen}
                      rows={2}
                      placeholder="How was the ride?"
                      className="w-full rounded-lg border border-primary-200 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                {!initialAttractionId && (
                  <button
                    onClick={() => { setSheetState('select'); setSelectedAttraction(null); setError(null); }}
                    disabled={commandFrozen}
                    className="flex-1 rounded-lg border border-primary-200 px-4 py-3 text-sm font-medium text-primary-700 hover:bg-primary-50"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {saving
                    ? (cleanupPending ? 'Finishing Cleanup...' : 'Saving...')
                    : cleanupPending
                      ? 'Finish Cleanup'
                      : commandFrozen
                      ? 'Retry Save'
                    : expanded
                      ? 'Submit & Log Ride ✓'
                      : 'Submit Wait Time ✓'}
                </button>
              </div>
              {commandFrozen && error && discardAllowed && (
                <button
                  type="button"
                  onClick={handleDiscardFailedSave}
                  className="w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Discard failed save & start over
                </button>
              )}

              <p className="text-xs text-center text-primary-400">
                {expanded
                  ? 'Your wait time report helps others & your ride is logged 🎢'
                  : 'Your report helps other guests plan their visit 🎢'}
              </p>
            </div>
          )}

          {/* ─── SUCCESS STATE ─── */}
          {sheetState === 'success' && (
            <div className="flex flex-col items-center py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <p className="mt-4 text-lg font-semibold text-primary-900">
                {expanded
                  ? waitReportSucceeded
                    ? 'Ride Logged & Wait Reported!'
                    : 'Ride Logged!'
                  : 'Wait Time Reported!'}
              </p>
              <p className="text-sm text-primary-500 mt-1">{selectedAttraction?.name}</p>
              {expanded && activeTripId && activeTripName && (
                <p className="text-xs text-green-600 mt-2 font-medium">✓ Added to trip: {activeTripName}</p>
              )}
              {successNotice && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
                  {successNotice}
                </p>
              )}

              <div className="mt-6 flex gap-3 w-full">
                <button
                  onClick={handleLogAnother}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  {expanded
                    ? `Log another${parks.find((p) => p.id === selectedParkId)?.name ? ` at ${parks.find((p) => p.id === selectedParkId)?.name}` : ''}`
                    : 'Report Another'}
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 rounded-lg border border-primary-200 px-4 py-3 text-sm font-medium text-primary-700 hover:bg-primary-50"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
