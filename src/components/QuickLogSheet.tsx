'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, Search, Clock, Star, Check, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';
import { getCollection, whereConstraint } from '@/lib/firebase/firestore';
import { addRideLog } from '@/lib/services/ride-log-service';
import { getActiveTrip } from '@/lib/services/trip-service';
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

type TemporalMode = 'now' | 'earlier' | 'past';

type SheetState = 'select' | 'form' | 'success';

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: 'thrill', label: '🎢 Thrill' },
  { value: 'family', label: '👨‍👩‍👧 Family' },
  { value: 'show', label: '🎭 Show' },
  { value: 'experience', label: '✨ Experience' },
  { value: 'character-meet', label: '🤝 Characters' },
  { value: 'dining', label: '🍽️ Dining' },
];

const LOGGABLE_ENTITY_TYPES = new Set(['ATTRACTION', 'RIDE', 'SHOW', 'MEET_AND_GREET']);

const LAST_PARK_KEY = 'parkflow-last-park';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface QuickLogSheetProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill with a specific park */
  initialParkId?: string;
  /** Pre-fill with a specific trip */
  initialTripId?: string;
}

export default function QuickLogSheet({ open, onClose, initialParkId, initialTripId }: QuickLogSheetProps) {
  const { user } = useAuth();

  // Sheet state
  const [sheetState, setSheetState] = useState<SheetState>('select');
  const [temporalMode, setTemporalMode] = useState<TemporalMode>('now');
  const [earlierTime, setEarlierTime] = useState('');
  const [pastDate, setPastDate] = useState('');

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

  // Trip association
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeTripName, setActiveTripName] = useState<string | null>(null);
  const [tripCheckDone, setTripCheckDone] = useState(false);
  const [standaloneMode, setStandaloneMode] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // Initialize temporal "earlier" default (30 min ago)
  useEffect(() => {
    if (open) {
      const thirtyAgo = new Date(Date.now() - 30 * 60 * 1000);
      const hh = thirtyAgo.getHours().toString().padStart(2, '0');
      const mm = thirtyAgo.getMinutes().toString().padStart(2, '0');
      setEarlierTime(`${hh}:${mm}`);
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      setPastDate(`${dateStr}T${timeStr}`);
    }
  }, [open]);

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
    // Try localStorage
    const last = typeof window !== 'undefined' ? localStorage.getItem(LAST_PARK_KEY) : null;
    if (last) setSelectedParkId(last);
  }, [open, initialParkId]);

  // Check for active trip
  useEffect(() => {
    if (!open || !user) return;
    if (initialTripId) {
      setActiveTripId(initialTripId);
      setTripCheckDone(true);
      return;
    }
    getActiveTrip(user.uid).then((t) => {
      setActiveTripId(t?.id ?? null);
      setActiveTripName(t?.name ?? null);
      setTripCheckDone(true);
    }).catch(() => { setActiveTripId(null); setActiveTripName(null); setTripCheckDone(true); });
  }, [open, user, initialTripId]);

  // Load attractions when park changes
  useEffect(() => {
    if (!selectedParkId) { setAttractions([]); return; }
    // Persist park choice
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

  // Compute rodeAt date
  const getRodeAt = useCallback((): Date => {
    if (temporalMode === 'now') return new Date();
    if (temporalMode === 'earlier') {
      const [hh, mm] = earlierTime.split(':').map(Number);
      const d = new Date();
      d.setHours(hh, mm, 0, 0);
      return d;
    }
    // past
    return new Date(pastDate);
  }, [temporalMode, earlierTime, pastDate]);

  // Handle attraction selection
  const handleSelectAttraction = (attraction: AttractionOption) => {
    setSelectedAttraction(attraction);
    setSheetState('form');
  };

  // Handle log submission
  const handleLog = async () => {
    if (!user || !selectedAttraction || !selectedParkId) return;
    setSaving(true);
    try {
      const parkName = parks.find((p) => p.id === selectedParkId)?.name || '';
      await addRideLog(user.uid, {
        parkId: selectedParkId,
        attractionId: selectedAttraction.id,
        parkName,
        attractionName: selectedAttraction.name,
        rodeAt: getRodeAt(),
        waitTimeMinutes: waitTimeMode === 'closed' ? null : (waitTime ? Number(waitTime) : null),
        attractionClosed: waitTimeMode === 'closed',
        source: 'manual',
        rating: rating || null,
        notes,
      }, activeTripId);

      setSheetState('success');
    } catch (err) {
      console.error('Failed to log ride:', err);
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
    setTemporalMode('now');
    setStandaloneMode(false);
    setTripCheckDone(false);
    onClose();
  };

  if (!open) return null;

  // Auth gate: show login prompt if not authenticated
  if (!user) {
    return (
      <>
        <div className="fixed inset-0 z-[60] bg-black/40" onClick={handleClose} />
        <div className="fixed inset-x-0 bottom-0 z-[70] rounded-t-2xl bg-white shadow-2xl pb-[env(safe-area-inset-bottom)]">
          <div className="px-4 pt-6 pb-8 text-center">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-primary-200" />
            <div className="text-4xl mb-3">🎢</div>
            <h2 className="text-lg font-semibold text-primary-900 mb-2">Sign in to Log Rides</h2>
            <p className="text-sm text-primary-500 mb-5 max-w-xs mx-auto">Create an account or sign in to start tracking your rides, wait times, and park adventures.</p>
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
            <h2 className="text-lg font-semibold text-primary-900">Log a Ride</h2>
            <button onClick={handleClose} className="rounded-full p-2 text-primary-400 hover:bg-primary-50 hover:text-primary-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Active trip indicator */}
          {activeTripId && activeTripName && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-1.5">
              <span className="text-xs">🗺️</span>
              <span className="text-xs font-medium text-green-700">Adding to trip: <strong>{activeTripName}</strong></span>
            </div>
          )}

          {/* No active trip prompt */}
          {tripCheckDone && !activeTripId && !standaloneMode && (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <MapPin className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-800">No active trip</span>
              </div>
              <p className="text-xs text-amber-700 mb-3">Start a trip to group your rides together, or log this one standalone.</p>
              <div className="flex gap-2">
                <Link
                  href="/trips/new"
                  className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
                >
                  Start a Trip
                </Link>
                <button
                  onClick={() => setStandaloneMode(true)}
                  className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50 transition-colors"
                >
                  Log Standalone
                </button>
              </div>
            </div>
          )}

          {/* Temporal mode selector */}
          <div className="mt-3 flex gap-1 rounded-lg bg-primary-100 p-1">
            {(['now', 'earlier', 'past'] as TemporalMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setTemporalMode(mode)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  temporalMode === mode ? 'bg-white text-primary-900 shadow-sm' : 'text-primary-500 hover:text-primary-700'
                }`}
              >
                {mode === 'now' && 'Now'}
                {mode === 'earlier' && 'Earlier'}
                {mode === 'past' && 'Past Date'}
              </button>
            ))}
          </div>

          {/* Time pickers */}
          {temporalMode === 'earlier' && (
            <div className="mt-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary-400" />
              <input
                type="time"
                value={earlierTime}
                onChange={(e) => setEarlierTime(e.target.value)}
                className="rounded-md border border-primary-200 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}
          {temporalMode === 'past' && (
            <div className="mt-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary-400" />
              <input
                type="datetime-local"
                value={pastDate}
                onChange={(e) => setPastDate(e.target.value)}
                className="rounded-md border border-primary-200 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>

        <div className="px-4 py-4">
          {/* ─── SELECT STATE ─── */}
          {sheetState === 'select' && (activeTripId || standaloneMode || !tripCheckDone) && (
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
              <div className="rounded-lg bg-primary-50 px-3 py-2">
                <p className="text-sm font-semibold text-primary-800">{selectedAttraction.name}</p>
                <p className="text-xs text-primary-500">{parks.find((p) => p.id === selectedParkId)?.name}</p>
              </div>

              {/* Wait time */}
              <WaitTimeInput
                value={waitTime}
                onChange={setWaitTime}
                mode={waitTimeMode}
                onModeChange={setWaitTimeMode}
              />

              {/* Rating */}
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">Rating</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
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
                  placeholder="Optional notes..."
                  className="w-full rounded-lg border border-primary-200 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setSheetState('select'); setSelectedAttraction(null); }}
                  className="flex-1 rounded-lg border border-primary-200 px-4 py-3 text-sm font-medium text-primary-700 hover:bg-primary-50"
                >
                  Back
                </button>
                <button
                  onClick={handleLog}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Log Ride ✓'}
                </button>
              </div>
            </div>
          )}

          {/* ─── SUCCESS STATE ─── */}
          {sheetState === 'success' && (
            <div className="flex flex-col items-center py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <p className="mt-4 text-lg font-semibold text-primary-900">Ride Logged!</p>
              <p className="text-sm text-primary-500 mt-1">{selectedAttraction?.name}</p>
              {activeTripId && activeTripName && (
                <p className="text-xs text-green-600 mt-2 font-medium">✓ Added to trip: {activeTripName}</p>
              )}
              {!activeTripId && standaloneMode && (
                <p className="text-xs text-primary-400 mt-2">Logged standalone — not linked to a trip</p>
              )}

              <div className="mt-6 flex gap-3 w-full">
                <button
                  onClick={handleLogAnother}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  Log Another
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
