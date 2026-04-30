'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { getCollection } from '@/lib/firebase/firestore';
import { DESTINATION_FAMILIES } from '@/lib/parks/park-registry';
import { getLocationByDestinationId, formatLocation } from '@/lib/parks/park-locations';
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

const BATCH_SIZE = 10;

/** Build a map of parkId → formatted location string from registry + locations */
function buildLocationMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const family of DESTINATION_FAMILIES) {
    for (const dest of family.destinations) {
      const loc = getLocationByDestinationId(dest.id);
      if (loc) {
        const formatted = formatLocation(loc);
        for (const park of dest.parks) {
          map[park.id] = formatted;
        }
      }
    }
  }
  return map;
}

const PARK_LOCATIONS = buildLocationMap();

export default function ParksPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shortestWaits, setShortestWaits] = useState<Record<string, number | null>>({});
  const [parkHours, setParkHours] = useState<Record<string, ParkHoursEntry>>({});
  const [latestFetchedAt, setLatestFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [searchQuery, setSearchQuery] = useState('');
  const abortRef = useRef<AbortController | null>(null);

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

  // Fetch wait times progressively in batches
  const fetchWaitTimes = useCallback(async (parkList: Park[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let maxTimestamp = 0;

    for (let i = 0; i < parkList.length; i += BATCH_SIZE) {
      if (controller.signal.aborted) return;

      const batch = parkList.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (park) => {
          const waitData = await getCollection<WaitTimeEntry>(
            `waitTimes/${park.id}/current`
          );
          const operatingWaits = waitData
            .filter((w) => w.status === 'OPERATING' && w.waitMinutes !== null)
            .map((w) => w.waitMinutes as number);
          const shortest = operatingWaits.length > 0 ? Math.min(...operatingWaits) : null;

          for (const w of waitData) {
            if (w.fetchedAt) {
              const t = new Date(w.fetchedAt).getTime();
              if (!isNaN(t) && t > maxTimestamp) maxTimestamp = t;
            }
          }

          return { parkId: park.id, shortest };
        })
      );

      if (controller.signal.aborted) return;

      // Update state progressively after each batch
      const batchWaits: Record<string, number | null> = {};
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          batchWaits[result.value.parkId] = result.value.shortest;
        } else {
          // Failed fetch — mark as null
          const idx = batchResults.indexOf(result);
          batchWaits[batch[idx].id] = null;
        }
      }

      setShortestWaits((prev) => ({ ...prev, ...batchWaits }));
      if (maxTimestamp > 0) setLatestFetchedAt(maxTimestamp);
    }

    setNow(Date.now());
  }, []);

  const fetchParks = useCallback(async () => {
    try {
      const data = await getCollection<Park>('parks');
      setParks(data);
      setLoading(false);

      // Fetch wait times progressively (non-blocking for initial render)
      fetchWaitTimes(data);
    } catch (error) {
      console.error('Failed to fetch parks:', error);
      setLoading(false);
    }
  }, [fetchWaitTimes]);

  useEffect(() => {
    fetchParks();
    fetchParkHours();
  }, [fetchParks, fetchParkHours]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/wait-times');
      setShortestWaits({});
      await Promise.all([fetchParks(), fetchParkHours()]);
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Filter parks by search query (includes location)
  const filteredParks = useMemo(() => {
    if (!searchQuery.trim()) return parks;
    const q = searchQuery.toLowerCase();
    return parks.filter(
      (park) =>
        park.name.toLowerCase().includes(q) ||
        park.destinationName.toLowerCase().includes(q) ||
        (PARK_LOCATIONS[park.id] || '').toLowerCase().includes(q)
    );
  }, [parks, searchQuery]);

  // Group parks by destination, sorted alphabetically
  const grouped = useMemo(() => {
    const groups = filteredParks.reduce<Record<string, Park[]>>((acc, park) => {
      const dest = park.destinationName || 'Other';
      if (!acc[dest]) acc[dest] = [];
      acc[dest].push(park);
      return acc;
    }, {});

    // Sort parks within each group alphabetically
    for (const dest of Object.keys(groups)) {
      groups[dest].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Return sorted destination entries
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredParks]);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
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

      {/* Search input */}
      {!loading && (
        <div className="relative mb-8">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search parks, destinations, or locations..."
            className="w-full rounded-lg border border-primary-200 bg-white py-2.5 pl-10 pr-4 text-sm text-primary-800 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-10">
          {[1, 2, 3].map((i) => (
            <section key={i}>
              <div className="mb-4 h-6 w-48 animate-pulse rounded bg-primary-100" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {[1, 2, 3, 4, 5].map((j) => (
                  <div key={j} className="h-32 animate-pulse rounded-xl border border-primary-100 bg-primary-50" />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <p className="py-12 text-center text-primary-400">
          No parks match &ldquo;{searchQuery}&rdquo;
        </p>
      ) : (
        <div className="space-y-10">
          {grouped.map(([destination, destParks]) => (
            <section key={destination}>
              <h2 className="mb-4 text-xl font-semibold text-primary-800">
                {destination}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
                      location={PARK_LOCATIONS[park.id]}
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
