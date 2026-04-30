'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { createTrip } from '@/lib/services/trip-service';
import { getCollection } from '@/lib/firebase/firestore';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import TripDayCard from '@/components/trips/TripDayCard';
import type { TripCreateData } from '@/types/trip';

interface ParkData {
  id: string;
  name: string;
  destinationName: string;
  destinationId: string;
}

interface TripDayEntry {
  date: string;
  parks: { id: string; name: string }[];
}

type TripMode = 'single' | 'multi';

export default function CreateTripPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<TripMode>('multi');
  const [tripName, setTripName] = useState('');
  const [days, setDays] = useState<TripDayEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Day builder state
  const [dayDate, setDayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [parks, setParks] = useState<ParkData[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedParks, setSelectedParks] = useState<Set<string>>(new Set());
  const [loadingParks, setLoadingParks] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function fetchParks() {
      try {
        const data = await getCollection<ParkData>('parks', []);
        setParks(data);
      } catch (err) {
        console.error('Failed to load parks:', err);
      } finally {
        setLoadingParks(false);
      }
    }
    fetchParks();
  }, [user]);

  // Group parks by destination
  const resortGroups = parks.reduce<Record<string, { name: string; parks: ParkData[] }>>((acc, p) => {
    if (!acc[p.destinationId]) {
      acc[p.destinationId] = { name: p.destinationName, parks: [] };
    }
    acc[p.destinationId].parks.push(p);
    return acc;
  }, {});

  const resortGroupOptions = useMemo(
    () => Object.entries(resortGroups).map(([id, group]) => ({
      id,
      label: group.name,
      sublabel: `${group.parks.length} parks`,
    })),
    [resortGroups],
  );

  const groupParks = selectedGroup ? (resortGroups[selectedGroup]?.parks ?? []).sort((a, b) => a.name.localeCompare(b.name)) : [];

  const togglePark = (parkId: string) => {
    setSelectedParks((prev) => {
      const next = new Set(prev);
      if (next.has(parkId)) next.delete(parkId);
      else next.add(parkId);
      return next;
    });
  };

  const addDay = () => {
    if (!dayDate || selectedParks.size === 0) return;
    const parksForDay = parks
      .filter((p) => selectedParks.has(p.id))
      .map((p) => ({ id: p.id, name: p.name }));

    setDays((prev) => [...prev, { date: dayDate, parks: parksForDay }]);
    // Reset builder
    setSelectedParks(new Set());
    setDayDate(new Date().toISOString().split('T')[0]);
    setSelectedGroup('');
  };

  const removeDay = (idx: number) => {
    setDays((prev) => prev.filter((_, i) => i !== idx));
  };

  const canSubmit = tripName.trim() && days.length > 0;

  const handleSubmit = useCallback(async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);
    try {
      const allParkIds = [...new Set(days.flatMap((d) => d.parks.map((p) => p.id)))];
      const parkNames: Record<string, string> = {};
      days.forEach((d) => d.parks.forEach((p) => { parkNames[p.id] = p.name; }));

      const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
      const startDate = sortedDays[0].date;
      const endDate = sortedDays[sortedDays.length - 1].date;

      const data: TripCreateData = {
        name: tripName.trim(),
        startDate,
        endDate,
        parkIds: allParkIds,
        parkNames,
        status: 'active',
        notes: '',
      };

      const tripId = await createTrip(user.uid, data);
      router.push(`/trips/${tripId}`);
    } catch (err) {
      console.error('Failed to create trip:', err);
      alert('Failed to create trip. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [user, canSubmit, days, tripName, router]);

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
        <h2 className="text-xl font-semibold text-primary-800">Sign in to start logging your trip</h2>
        <p className="text-primary-500 max-w-sm">
          Ready for an adventure? Sign in to plan your parks, track your rides, and keep a record of every magical moment.
        </p>
        <Link
          href="/auth/signin"
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          🚀 Sign In to Start Logging
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-24 md:pb-8">
      {/* Back link */}
      <Link href="/trips" className="inline-flex items-center gap-1 text-sm text-primary-500 hover:text-primary-700 mb-4">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to My Trips
      </Link>

      {/* Header */}
      <h1 className="text-2xl font-bold text-primary-900 sm:text-3xl">Log Your Park Trip</h1>
      <p className="mt-1 text-primary-500">Track your rides across multiple parks in a single trip</p>

      {/* Trip Name */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-primary-700">Trip Name</label>
        <input
          type="text"
          value={tripName}
          onChange={(e) => setTripName(e.target.value)}
          placeholder="e.g., Spring Break 2026, Birthday Trip"
          className="mt-1 w-full rounded-lg border border-primary-200 px-3 py-2.5 text-sm text-primary-900 placeholder:text-primary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        />
      </div>

      {/* Mode Tabs */}
      <div className="mt-6">
        <p className="text-sm font-medium text-primary-700">Plan Your Trip</p>
        <p className="text-xs text-primary-400 mt-0.5">Choose between a single-day visit or a multi-day trip across different parks</p>
        <div className="mt-3 flex gap-1 rounded-lg bg-primary-100 p-1">
          <button
            onClick={() => setMode('single')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
              mode === 'single' ? 'bg-white text-primary-900 shadow-sm' : 'text-primary-500 hover:text-primary-700'
            }`}
          >
            Single Day
          </button>
          <button
            onClick={() => setMode('multi')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
              mode === 'multi' ? 'bg-white text-primary-900 shadow-sm' : 'text-primary-500 hover:text-primary-700'
            }`}
          >
            Multi-Day Trip
          </button>
        </div>
      </div>

      {/* Days Added */}
      {days.length > 0 && (
        <div className="mt-6 space-y-2">
          <h3 className="text-sm font-medium text-primary-700">Trip Days ({days.length})</h3>
          {days.map((day, idx) => (
            <TripDayCard
              key={`${day.date}-${idx}`}
              date={day.date}
              parks={day.parks}
              onRemove={() => removeDay(idx)}
            />
          ))}
        </div>
      )}

      {/* Day Builder */}
      <div className="mt-6 rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">📅</span>
          <h3 className="text-base font-semibold text-primary-800">
            {mode === 'multi' ? 'Multi-Day Trip Planner' : 'Single Day Visit'}
          </h3>
        </div>
        <p className="text-xs text-primary-500 mb-4">
          {mode === 'multi'
            ? 'Plan your trip across multiple days and parks. Add each day separately, selecting which park(s) you visited on that date.'
            : 'Select a date and the parks you plan to visit.'}
        </p>

        <div className="space-y-4">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1">
              {mode === 'multi' ? 'Add a Day to Your Trip' : 'Visit Date'}
            </label>
            <input
              type="date"
              value={dayDate}
              onChange={(e) => setDayDate(e.target.value)}
              className="w-full rounded-lg border border-primary-200 px-3 py-2.5 text-sm text-primary-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
            <p className="mt-1 text-xs text-primary-400">
              You can plan future trips, but can only log rides for today and past dates
            </p>
          </div>

          {/* Resort Group */}
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1">Resort Group</label>
            {loadingParks ? (
              <div className="rounded-lg border border-primary-200 px-3 py-2.5 text-sm text-primary-400">
                Loading parks...
              </div>
            ) : (
              <SearchableSelect
                options={resortGroupOptions}
                value={selectedGroup}
                onChange={(val) => { setSelectedGroup(val); setSelectedParks(new Set()); }}
                placeholder="Search resort groups…"
                id="resort-group"
                label="Resort Group"
              />
            )}
          </div>

          {/* Park Checkboxes */}
          {selectedGroup && groupParks.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-primary-700 mb-2">Parks Visited This Day</label>
              <div className="space-y-2">
                {groupParks.map((park) => (
                  <label key={park.id} className="flex items-center gap-3 rounded-lg border border-primary-100 px-3 py-2.5 hover:bg-primary-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedParks.has(park.id)}
                      onChange={() => togglePark(park.id)}
                      className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-primary-800">{park.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Add Day Button */}
          <button
            onClick={addDay}
            disabled={!dayDate || selectedParks.size === 0}
            className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              dayDate && selectedParks.size > 0
                ? 'bg-coral-500 text-white shadow-sm hover:bg-coral-600'
                : 'bg-primary-100 text-primary-400 cursor-not-allowed'
            }`}
          >
            {mode === 'multi' ? 'Add This Day to Trip' : 'Set Visit Day'}
          </button>
        </div>
      </div>

      {/* Submit */}
      <div className="mt-8">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className={`w-full rounded-lg px-4 py-3 text-base font-semibold transition-all ${
            canSubmit && !submitting
              ? 'bg-primary-600 text-white shadow-md hover:bg-primary-700'
              : 'bg-primary-100 text-primary-400 cursor-not-allowed'
          }`}
        >
          {submitting ? 'Creating Trip...' : 'Start Trip'}
        </button>
      </div>
    </div>
  );
}
