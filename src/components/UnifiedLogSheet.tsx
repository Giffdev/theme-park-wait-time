'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, Search, Clock, Star, Check, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';
import { getCollection, whereConstraint } from '@/lib/firebase/firestore';
import { addRideLog } from '@/lib/services/ride-log-service';
import { submitWaitTimeReport } from '@/lib/firebase/waitTimeReports';
import { getActiveTrip, getTripRideLogs } from '@/lib/services/trip-service';
import { classifyAttraction } from '@/lib/utils/classify-attraction';
import WaitTimeInput from '@/components/ride-log/WaitTimeInput';
import type { WaitTimeMode } from '@/components/ride-log/WaitTimeInput';
import type { AttractionType } from '@/types/attraction';

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

const LAST_PARK_KEY = 'parkflow-last-park';

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

  // Trip association
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeTripName, setActiveTripName] = useState<string | null>(null);
  const [tripCheckDone, setTripCheckDone] = useState(false);
  const [standaloneMode, setStandaloneMode] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // Sync expandedByDefault prop
  useEffect(() => {
    if (open) setExpanded(expandedByDefault);
  }, [open, expandedByDefault]);

  // Load parks
  useEffect(() => {
    if (!open || !user) return;
    getCollection<{ name: string }>('parks', []).then((docs) => {
      setParks(docs.map((d) => ({ id: d.id, name: d.name })).sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, [open, user]);

  // Resolve initial park
  useEffect(() => {
    if (!open) return;
    if (initialParkId) {
      setSelectedParkId(initialParkId);
      return;
    }
    const last = typeof window !== 'undefined' ? localStorage.getItem(LAST_PARK_KEY) : null;
    if (last) setSelectedParkId(last);
  }, [open, initialParkId]);

  // If attraction is pre-selected, jump to form
  useEffect(() => {
    if (!open || !initialAttractionId || !initialAttractionName) return;
    setSelectedAttraction({
      id: initialAttractionId,
      name: initialAttractionName,
      effectiveType: 'thrill' as AttractionType,
    });
    setSheetState('form');
  }, [open, initialAttractionId, initialAttractionName]);

  // Check for active trip and default park from today's logs
  useEffect(() => {
    if (!open || !user) return;
    getActiveTrip(user.uid).then(async (t) => {
      setActiveTripId(t?.id ?? null);
      setActiveTripName(t?.name ?? null);
      setTripCheckDone(true);

      // If no explicit initialParkId, try to default from today's most recent ride log
      if (!initialParkId && t?.id) {
        try {
          const logs = await getTripRideLogs(user.uid, t.id);
          const todayStr = new Date().toISOString().split('T')[0];
          const todayLog = logs.find((log) => {
            const raw = log.rodeAt as unknown;
            const d = raw instanceof Date
              ? raw
              : (raw && typeof (raw as { toDate?: () => Date }).toDate === 'function')
                ? (raw as { toDate: () => Date }).toDate()
                : new Date(raw as string | number);
            return d.toISOString().split('T')[0] === todayStr;
          });
          if (todayLog) {
            setSelectedParkId(todayLog.parkId);
          }
        } catch {
          // Ignore — localStorage fallback already applied
        }
      }
    }).catch(() => { setActiveTripId(null); setActiveTripName(null); setTripCheckDone(true); });
  }, [open, user, initialParkId]);

  // Load attractions when park changes
  useEffect(() => {
    if (!selectedParkId) { setAttractions([]); return; }
    if (typeof window !== 'undefined') localStorage.setItem(LAST_PARK_KEY, selectedParkId);

    getCollection<{ name: string; entityType?: string; attractionType?: AttractionType | null }>(
      'attractions',
      [whereConstraint('parkId', '==', selectedParkId)]
    ).then((docs) => {
      setAttractions(
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
    });
  }, [selectedParkId]);

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

  // Handle attraction selection
  const handleSelectAttraction = (attraction: AttractionOption) => {
    setSelectedAttraction(attraction);
    setSheetState('form');
  };

  // Compute wait time value for the report
  const getReportWaitTime = useCallback((): number => {
    if (waitTimeMode === 'closed') return -1;
    if (waitTimeMode === 'no-wait') return 0;
    const parsed = parseInt(waitTime, 10);
    return isNaN(parsed) ? -2 : parsed; // -2 sentinel for "unknown/not provided"
  }, [waitTime, waitTimeMode]);

  // Handle submission — ALWAYS reports wait time; optionally logs ride
  const handleSubmit = async () => {
    if (!user || !selectedAttraction || !selectedParkId) return;
    setError(null);

    const reportWait = getReportWaitTime();

    // Validate: we need a valid wait time (not unknown) for "report only" fast path
    if (!expanded && reportWait === -2) {
      setError('Enter a wait time to submit your report.');
      return;
    }

    // In fast-path, validate range
    if (!expanded && reportWait !== -1 && (reportWait < 0 || reportWait > 300)) {
      setError('Wait time must be between 0 and 300 minutes.');
      return;
    }

    setSaving(true);
    try {
      const parkName = parks.find((p) => p.id === selectedParkId)?.name || '';

      // Always submit wait time report (if user provided one)
      if (reportWait !== -2) {
        await submitWaitTimeReport({
          attractionId: selectedAttraction.id,
          attractionName: selectedAttraction.name,
          parkId: selectedParkId,
          userId: user.uid,
          username: user.displayName || user.email || 'Anonymous',
          waitTime: reportWait,
        });
        onWaitTimeReported?.(reportWait);
      }

      // If expanded (ride log mode), also log the ride
      if (expanded) {
        await addRideLog(user.uid, {
          parkId: selectedParkId,
          attractionId: selectedAttraction.id,
          parkName,
          attractionName: selectedAttraction.name,
          rodeAt: new Date(),
          waitTimeMinutes: waitTimeMode === 'closed' ? null : (waitTime ? Number(waitTime) : null),
          attractionClosed: waitTimeMode === 'closed',
          source: 'manual',
          rating: rating || null,
          notes,
        }, activeTripId);
      }

      setSheetState('success');
    } catch (err) {
      console.error('Submission failed:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Reset for "Log Another"
  const handleLogAnother = () => {
    setSelectedAttraction(null);
    setWaitTime('');
    setWaitTimeMode('unknown');
    setRating(0);
    setNotes('');
    setSearchQuery('');
    setError(null);
    setExpanded(expandedByDefault);
    setSheetState('select');
  };

  // Full reset on close
  const handleClose = () => {
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
    setTripCheckDone(false);
    setError(null);
    onClose();
  };

  if (!open) return null;

  // Auth gate
  if (!user) {
    return (
      <>
        <div className="fixed inset-0 z-[60] bg-black/40" onClick={handleClose} />
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
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={handleClose} />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-[70] max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl transition-transform duration-300 pb-[env(safe-area-inset-bottom)]">
        {/* Handle bar */}
        <div className="sticky top-0 z-10 bg-white pt-3 pb-2 px-4 border-b border-primary-100 rounded-t-2xl">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-primary-200" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary-900">
              {expanded ? 'Report & Log Ride' : 'Report Wait Time'}
            </h2>
            <button onClick={handleClose} className="rounded-full p-2 text-primary-400 hover:bg-primary-50 hover:text-primary-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-4 py-4">
          {/* ─── SELECT STATE ─── */}
          {sheetState === 'select' && (
            <>
              {/* Park selector */}
              <div className="mb-4">
                <select
                  value={selectedParkId}
                  onChange={(e) => setSelectedParkId(e.target.value)}
                  className="w-full rounded-lg border border-primary-200 px-3 py-2.5 text-sm text-primary-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Select a park...</option>
                  {parks.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
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
                      <p className="py-4 text-center text-sm text-primary-400">No attractions found</p>
                    )}
                    {filteredAttractions.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => handleSelectAttraction(a)}
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
                <p className="text-sm font-semibold text-primary-800">{selectedAttraction.name}</p>
                <p className="text-xs text-primary-500">{parks.find((p) => p.id === selectedParkId)?.name}</p>
              </div>

              {/* Wait time input — always visible */}
              <WaitTimeInput
                value={waitTime}
                onChange={setWaitTime}
                mode={waitTimeMode}
                onModeChange={setWaitTimeMode}
              />

              {/* ─── Expand toggle: "I rode this" ─── */}
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
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

                  {/* No active trip prompt (inline) */}
                  {tripCheckDone && !activeTripId && !standaloneMode && (
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
                  {tripCheckDone && !activeTripId && standaloneMode && (
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
                    ? 'Saving...'
                    : expanded
                      ? 'Submit & Log Ride ✓'
                      : 'Submit Wait Time ✓'}
                </button>
              </div>

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
                {expanded ? 'Ride Logged & Wait Reported!' : 'Wait Time Reported!'}
              </p>
              <p className="text-sm text-primary-500 mt-1">{selectedAttraction?.name}</p>
              {expanded && activeTripId && activeTripName && (
                <p className="text-xs text-green-600 mt-2 font-medium">✓ Added to trip: {activeTripName}</p>
              )}

              <div className="mt-6 flex gap-3 w-full">
                <button
                  onClick={handleLogAnother}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  Report Another
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
