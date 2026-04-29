'use client';

import { useEffect, useState, useCallback } from 'react';
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
}

export default function ParksPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shortestWaits, setShortestWaits] = useState<Record<string, number | null>>({});

  const fetchParks = useCallback(async () => {
    try {
      const data = await getCollection<Park>('parks');
      setParks(data);

      // Fetch shortest wait for each park from waitTimes subcollection
      const waits: Record<string, number | null> = {};
      for (const park of data) {
        try {
          const waitData = await getCollection<WaitTimeEntry>(
            `waitTimes/${park.id}/current`
          );
          const operatingWaits = waitData
            .filter((w) => w.status === 'OPERATING' && w.waitMinutes !== null)
            .map((w) => w.waitMinutes as number);
          waits[park.id] = operatingWaits.length > 0 ? Math.min(...operatingWaits) : null;
        } catch {
          waits[park.id] = null;
        }
      }
      setShortestWaits(waits);
    } catch (error) {
      console.error('Failed to fetch parks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchParks();
  }, [fetchParks]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/wait-times');
      await fetchParks();
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
                {destParks.map((park) => (
                  <ParkCard
                    key={park.id}
                    id={park.id}
                    name={park.name}
                    destinationName={park.destinationName}
                    shortestWait={shortestWaits[park.id] ?? null}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
