'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';
import { getTrip, updateTrip } from '@/lib/services/trip-service';
import { getCollection } from '@/lib/firebase/firestore';
import TripDayCard from '@/components/trips/TripDayCard';
import type { Trip, TripUpdateData } from '@/types/trip';

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

export default function EditTripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [trip, setTrip] = useState<(Trip & { id: string }) | null>(null);
  const [tripName, setTripName] = useState('');
  const [notes, setNotes] = useState('');
  const [days, setDays] = useState<TripDayEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Day builder state
  const [dayDate, setDayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [parks, setParks] = useState<ParkData[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedParks, setSelectedParks] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchData() {
      if (!user || !tripId) return;
      try {
        const [tripData, parksData] = await Promise.all([
          getTrip(user.uid, tripId),
          getCollection<ParkData>('parks', []),
        ]);
        if (tripData) {
          setTrip(tripData);
          setTripName(tripData.name);
          setNotes(tripData.notes);
          // Reconstruct days from trip data (simplified: one entry per unique date in range)
          const existingDays: TripDayEntry[] = [];
          const start = new Date(tripData.startDate + 'T00:00:00');
          const end = new Date(tripData.endDate + 'T00:00:00');
          const allParks = Object.entries(tripData.parkNames).map(([id, name]) => ({ id, name }));
          // Simple reconstruction: all parks on all days
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            existingDays.push({
              date: d.toISOString().split('T')[0],
              parks: allParks,
            });
          }
          setDays(existingDays);
        }
        setParks(parksData);
      } catch (err) {
        console.error('Failed to load trip:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user, tripId]);

  const resortGroups = parks.reduce<Record<string, { name: string; parks: ParkData[] }>>((acc, p) => {
    if (!acc[p.destinationId]) {
      acc[p.destinationId] = { name: p.destinationName, parks: [] };
    }
    acc[p.destinationId].parks.push(p);
    return acc;
  }, {});

  const groupParks = selectedGroup ? resortGroups[selectedGroup]?.parks ?? [] : [];

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
    setSelectedParks(new Set());
    setSelectedGroup('');
  };

  const removeDay = (idx: number) => {
    setDays((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = useCallback(async () => {
    if (!user || !trip || !tripName.trim() || days.length === 0) return;
    setSaving(true);
    try {
      const allParkIds = [...new Set(days.flatMap((d) => d.parks.map((p) => p.id)))];
      const parkNames: Record<string, string> = {};
      days.forEach((d) => d.parks.forEach((p) => { parkNames[p.id] = p.name; }));

      const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
      const startDate = sortedDays[0].date;
      const endDate = sortedDays[sortedDays.length - 1].date;

      const updateData: TripUpdateData = {
        name: tripName.trim(),
        startDate,
        endDate,
        parkIds: allParkIds,
        parkNames,
        notes,
      };

      await updateTrip(user.uid, trip.id, updateData);
      router.push(`/trips/${trip.id}`);
    } catch (err) {
      console.error('Failed to update trip:', err);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [user, trip, tripName, days, notes, router]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-primary-900">Trip Not Found</h1>
        <Link href="/trips" className="mt-4 inline-block text-primary-600 hover:text-primary-700 font-medium">
          ← Back to My Trips
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-24 md:pb-8">
      <Link href={`/trips/${trip.id}`} className="inline-flex items-center gap-1 text-sm text-primary-500 hover:text-primary-700 mb-4">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to Trip
      </Link>

      <h1 className="text-2xl font-bold text-primary-900 sm:text-3xl">Edit Trip</h1>
      <p className="mt-1 text-primary-500">Update your trip details, add or remove days</p>

      {/* Trip Name */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-primary-700">Trip Name</label>
        <input
          type="text"
          value={tripName}
          onChange={(e) => setTripName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-primary-200 px-3 py-2.5 text-sm text-primary-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        />
      </div>

      {/* Notes */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-primary-700">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Add any trip notes..."
          className="mt-1 w-full rounded-lg border border-primary-200 px-3 py-2.5 text-sm text-primary-900 placeholder:text-primary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        />
      </div>

      {/* Existing Days */}
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

      {/* Add Day */}
      <div className="mt-6 rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-primary-800 mb-3">Add Another Day</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1">Date</label>
            <input
              type="date"
              value={dayDate}
              onChange={(e) => setDayDate(e.target.value)}
              className="w-full rounded-lg border border-primary-200 px-3 py-2.5 text-sm text-primary-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1">Resort Group</label>
            <select
              value={selectedGroup}
              onChange={(e) => { setSelectedGroup(e.target.value); setSelectedParks(new Set()); }}
              className="w-full rounded-lg border border-primary-200 px-3 py-2.5 text-sm text-primary-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="">Select a resort group...</option>
              {Object.entries(resortGroups).map(([id, group]) => (
                <option key={id} value={id}>
                  {group.name} ({group.parks.length} parks)
                </option>
              ))}
            </select>
          </div>

          {selectedGroup && groupParks.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-primary-700 mb-2">Parks</label>
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

          <button
            onClick={addDay}
            disabled={!dayDate || selectedParks.size === 0}
            className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              dayDate && selectedParks.size > 0
                ? 'bg-coral-500 text-white shadow-sm hover:bg-coral-600'
                : 'bg-primary-100 text-primary-400 cursor-not-allowed'
            }`}
          >
            Add This Day
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="mt-8 flex gap-3">
        <Link
          href={`/trips/${trip.id}`}
          className="flex-1 rounded-lg border border-primary-200 px-4 py-3 text-center text-sm font-medium text-primary-700 hover:bg-primary-50"
        >
          Cancel
        </Link>
        <button
          onClick={handleSave}
          disabled={!tripName.trim() || days.length === 0 || saving}
          className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold transition-all ${
            tripName.trim() && days.length > 0 && !saving
              ? 'bg-primary-600 text-white shadow-md hover:bg-primary-700'
              : 'bg-primary-100 text-primary-400 cursor-not-allowed'
          }`}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
