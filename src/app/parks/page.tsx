'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, Search, X, Star } from 'lucide-react';
import { getCollection } from '@/lib/firebase/firestore';
import { DESTINATION_FAMILIES } from '@/lib/parks/park-registry';
import { getLocationByDestinationId, formatLocation } from '@/lib/parks/park-locations';

const FAVORITES_STORAGE_KEY = 'parkflow-favorite-families';

/** Map family names to familyIds and vice versa for localStorage persistence */
const FAMILY_NAME_TO_ID: Record<string, string> = {};
const FAMILY_ID_TO_NAME: Record<string, string> = {};
for (const family of DESTINATION_FAMILIES) {
  FAMILY_NAME_TO_ID[family.familyName] = family.familyId;
  FAMILY_ID_TO_NAME[family.familyId] = family.familyName;
}
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

/** Resolve location for any park — uses pre-built map first, falls back to destinationId lookup */
function resolveLocation(park: { id: string; destinationId?: string }): string | undefined {
  if (PARK_LOCATIONS[park.id]) return PARK_LOCATIONS[park.id];
  if (park.destinationId) {
    const loc = getLocationByDestinationId(park.destinationId);
    return loc ? formatLocation(loc) : undefined;
  }
  return undefined;
}

export default function ParksPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shortestWaits, setShortestWaits] = useState<Record<string, number | null>>({});
  const [parkHours, setParkHours] = useState<Record<string, ParkHoursEntry>>({});
  const [latestFetchedAt, setLatestFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFamily, setSelectedFamily] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize favorites from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setFavorites(parsed);
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const toggleFavorite = useCallback((familyName: string) => {
    const familyId = FAMILY_NAME_TO_ID[familyName] || familyName;
    setFavorites((prev) => {
      const next = prev.includes(familyId)
        ? prev.filter((id) => id !== familyId)
        : [...prev, familyId];
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage full or unavailable
      }
      return next;
    });
  }, []);

  const isFavorited = useCallback((familyName: string) => {
    const familyId = FAMILY_NAME_TO_ID[familyName] || familyName;
    return favorites.includes(familyId);
  }, [favorites]);

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

  // All unique destination family names sorted alphabetically
  const allFamilies = useMemo(() => {
    const names = [...new Set(parks.map((p) => p.destinationName || 'Other'))];
    return names.sort((a, b) => a.localeCompare(b));
  }, [parks]);

  // Matching families for unified dropdown
  const matchingFamilies = useMemo(() => {
    if (!searchQuery.trim()) return allFamilies;
    const q = searchQuery.toLowerCase();
    return allFamilies.filter((f) => f.toLowerCase().includes(q));
  }, [allFamilies, searchQuery]);

  // Matching individual parks for unified dropdown (show when typing)
  const matchingParksForDropdown = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return parks
      .filter(
        (park) =>
          park.name.toLowerCase().includes(q) ||
          (resolveLocation(park) || '').toLowerCase().includes(q)
      )
      .slice(0, 8); // Limit dropdown suggestions
  }, [parks, searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter parks by search query AND selected family
  const filteredParks = useMemo(() => {
    let result = parks;

    if (selectedFamily) {
      result = result.filter((park) => (park.destinationName || 'Other') === selectedFamily);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (park) =>
          park.name.toLowerCase().includes(q) ||
          park.destinationName.toLowerCase().includes(q) ||
          (resolveLocation(park) || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [parks, searchQuery, selectedFamily]);

  // Group parks by destination, favorites first then alphabetical
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

    // Sort: favorites first (alphabetical), then non-favorites (alphabetical)
    return Object.entries(groups).sort(([a], [b]) => {
      const aFav = isFavorited(a);
      const bFav = isFavorited(b);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.localeCompare(b);
    });
  }, [filteredParks, isFavorited]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
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
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
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

      {/* Unified Search & Filter */}
      {!loading && (
        <div className="relative mb-8" ref={dropdownRef}>
          {/* Input with optional family chip */}
          <div className="flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-3 py-2.5 transition-colors focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-400">
            <Search className="h-4 w-4 shrink-0 text-primary-400" />
            {selectedFamily && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                {selectedFamily}
                <button
                  onClick={() => {
                    setSelectedFamily('');
                    inputRef.current?.focus();
                  }}
                  className="rounded-sm text-primary-400 hover:text-primary-600"
                  aria-label={`Remove ${selectedFamily} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDropdownOpen(false);
                  inputRef.current?.blur();
                }
                if (e.key === 'Backspace' && !searchQuery && selectedFamily) {
                  setSelectedFamily('');
                }
              }}
              placeholder={selectedFamily ? 'Filter parks...' : 'Search parks, families, or locations...'}
              className="min-w-0 flex-1 bg-transparent text-sm text-primary-800 placeholder:text-primary-300 focus:outline-none"
            />
            {(searchQuery || selectedFamily) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedFamily('');
                  setDropdownOpen(false);
                }}
                className="shrink-0 rounded p-0.5 text-primary-400 hover:text-primary-600"
                aria-label="Clear all filters"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Unified dropdown */}
          {dropdownOpen && (matchingFamilies.length > 0 || matchingParksForDropdown.length > 0) && (
            <div className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-primary-200 bg-white py-1 shadow-lg">
              {/* Park Families section */}
              {matchingFamilies.length > 0 && !selectedFamily && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-400">
                    Park Families
                  </div>
                  {/* Sort: favorites first */}
                  {[...matchingFamilies]
                    .sort((a, b) => {
                      const aFav = isFavorited(a);
                      const bFav = isFavorited(b);
                      if (aFav && !bFav) return -1;
                      if (!aFav && bFav) return 1;
                      return 0;
                    })
                    .map((family) => (
                      <div
                        key={family}
                        onClick={() => {
                          setSelectedFamily(family);
                          setSearchQuery('');
                          setDropdownOpen(false);
                          inputRef.current?.focus();
                        }}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-primary-700 transition-colors hover:bg-primary-50"
                      >
                        <Star
                          className={`h-3.5 w-3.5 shrink-0 ${
                            isFavorited(family)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-primary-200'
                          }`}
                        />
                        <span className="flex-1">{family}</span>
                      </div>
                    ))}
                </div>
              )}

              {/* Individual Parks section */}
              {matchingParksForDropdown.length > 0 && (
                <div>
                  {!selectedFamily && matchingFamilies.length > 0 && (
                    <div className="mx-3 my-1 border-t border-primary-100" />
                  )}
                  <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-400">
                    Parks
                  </div>
                  {matchingParksForDropdown.map((park) => (
                    <div
                      key={park.id}
                      onClick={() => {
                        setSearchQuery(park.name);
                        setDropdownOpen(false);
                      }}
                      className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm text-primary-700 transition-colors hover:bg-primary-50"
                    >
                      <span>{park.name}</span>
                      <span className="text-xs text-primary-400">{park.destinationName}</span>
                    </div>
                  ))}
                </div>
              )}

              {matchingFamilies.length === 0 && matchingParksForDropdown.length === 0 && (
                <div className="px-3 py-2 text-sm text-primary-400">No matches</div>
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-10">
          {[1, 2, 3].map((i) => (
            <section key={i}>
              <div className="mb-4 h-6 w-48 animate-pulse rounded bg-primary-100" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-44 animate-pulse rounded-xl border border-primary-100 bg-primary-50" />
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
        <div className="space-y-12">
          {grouped.map(([destination, destParks]) => {
            const destLocation = destParks[0] ? resolveLocation(destParks[0]) : undefined;
            return (
              <section key={destination}>
                <div className="mb-5 border-b border-primary-100 pb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-primary-800">
                      {destination}
                    </h2>
                    <button
                      onClick={() => toggleFavorite(destination)}
                      className="rounded-md p-1 transition-colors hover:bg-primary-100"
                      aria-label={isFavorited(destination) ? `Unfavorite ${destination}` : `Favorite ${destination}`}
                      title={isFavorited(destination) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star
                        className={`h-5 w-5 transition-colors ${
                          isFavorited(destination)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-primary-300 hover:text-amber-400'
                        }`}
                      />
                    </button>
                  </div>
                  {destLocation && (
                    <p className="mt-0.5 text-sm text-primary-400">{destLocation}</p>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            );
          })}

          {/* Coverage Summary */}
          {grouped.length > 0 && (
            <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary-500">
                Coverage Summary
              </h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-2xl font-bold text-primary-800">{grouped.length}</p>
                  <p className="text-xs text-primary-500">Resort Groups</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary-800">{filteredParks.length}</p>
                  <p className="text-xs text-primary-500">Total Parks</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary-800">
                    {filteredParks.filter((p) => !p.name.toLowerCase().includes('water')).length}
                  </p>
                  <p className="text-xs text-primary-500">Theme Parks</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary-800">
                    {filteredParks.filter((p) => p.name.toLowerCase().includes('water')).length}
                  </p>
                  <p className="text-xs text-primary-500">Water Parks</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
