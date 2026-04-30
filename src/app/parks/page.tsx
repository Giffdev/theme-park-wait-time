'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { getCollection } from '@/lib/firebase/firestore';
import ParkCard from '@/components/ParkCard';

interface Park {
  id: string;
  name: string;
  slug: string;
  destinationName: string;
  destinationId: string;
}

interface WaitTimeEntry {
  attractionId: string;
  attractionName: string;
  status: string;
  waitMinutes: number | null;
  fetchedAt?: string;
}

interface ParkHoursEntry {
  parkId: string;
  slug: string;
  timezone: string;
  isOpen: boolean;
  todayHours: { openTime: string; closeTime: string } | null;
  localTime: string;
}

export default function ParksPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shortestWaits, setShortestWaits] = useState<Record<string, number | null>>({});
  const [parkHours, setParkHours] = useState<Record<string, ParkHoursEntry>>({});
  const [latestFetchedAt, setLatestFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick every 30s for freshness label
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const dataFreshness = useMemo(() => {
    if (!latestFetchedAt) return null;
    const ageMs = now - latestFetchedAt;
    const ageMin = Math.round(ageMs / 60_000);
    const isStale = ageMin >= 10;
    let label: string;
    if (ageMin < 1) {
      label = 'Updated just now';
    } else if (ageMin === 1) {
      label = 'Updated 1 min ago';
    } else if (ageMin < 60) {
      label = `Updated ${ageMin} min ago`;
    } else {
      label = `Updated as of ${new Date(latestFetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    return { label, isStale };
  }, [latestFetchedAt, now]);

  // Fetch park hours from API (non-blocking — park cards render without it)
  const fetchParkHours = useCallback(async () => {
    try {
      const res = await fetch('/api/park-hours');
      if (res.ok) {
        const data: ParkHoursEntry[] = await res.json();
        const map: Record<string, ParkHoursEntry> = {};
        for (const entry of data) {
          map[entry.parkId] = entry;
        }
        setParkHours(map);
      }
    } catch {
      // Park hours are supplemental — don't break the page
    }
  }, []);

  const fetchParks = useCallback(async () => {
    try {
      const data = await getCollection<Park>('parks');
      setParks(data);

      // Fetch shortest wait for each park from waitTimes subcollection
      const waits: Record<string, number | null> = {};
      let maxTimestamp = 0;
      for (const park of data) {
        try {
          const waitData = await getCollection<WaitTimeEntry>(
            `waitTimes/${park.id}/current`
          );
          const operatingWaits = waitData
            .filter((w) => w.status === 'OPERATING' && w.waitMinutes !== null)
            .map((w) => w.waitMinutes as number);
          waits[park.id] = operatingWaits.length > 0 ? Math.min(...operatingWaits) : null;
          // Track most recent fetchedAt
          for (const w of waitData) {
            if (w.fetchedAt) {
              const t = new Date(w.fetchedAt).getTime();
              if (!isNaN(t) && t > maxTimestamp) maxTimestamp = t;
            }
          }
        } catch {
          waits[park.id] = null;
        }
      }
      setShortestWaits(waits);
      if (maxTimestamp > 0) setLatestFetchedAt(maxTimestamp);
      setNow(Date.now());
    } catch (error) {
      console.error('Failed to fetch parks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchParks();
    fetchParkHours();
  }, [fetchParks, fetchParkHours]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/wait-times');
      await Promise.all([fetchParks(), fetchParkHours()]);
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Group parks by destination
  const grouped = parks.reduce<Record<string, Park[]>>((acc, park) => {
    const dest = park.destinationName || 'Other';
    if (!acc[dest]) acc[dest] = [];
    acc[dest].push(park);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary-900">Theme Parks</h1>
          <p className="mt-2 text-primary-500">
            Select a park to view live wait times and attraction details.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg bg-coral-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-coral-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>
      {dataFreshness && (
        <p className={`-mt-6 mb-6 text-right text-xs ${dataFreshness.isStale ? 'text-amber-600' : 'text-primary-400'}`}>
          {dataFreshness.label}
        </p>
      )}

      {loading ? (
        <div className="space-y-10">
          {[1, 2, 3].map((i) => (
            <section key={i}>
              <div className="mb-4 h-6 w-48 animate-pulse rounded bg-primary-100" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="h-36 animate-pulse rounded-xl border border-primary-100 bg-primary-50" />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(grouped).map(([destination, destParks]) => (
            <section key={destination}>
              <h2 className="mb-4 text-xl font-semibold text-primary-800">
                {destination}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {destParks.map((park) => {
                  const hours = parkHours[park.id];
                  return (
                    <ParkCard
                      key={park.id}
                      slug={park.slug}
                      name={park.name}
                      destinationName={park.destinationName}
                      shortestWait={shortestWaits[park.id] ?? null}
                      isOpen={hours?.isOpen}
                      todayHours={hours?.todayHours}
                      timezone={hours?.timezone}
                      localTime={hours?.localTime}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
