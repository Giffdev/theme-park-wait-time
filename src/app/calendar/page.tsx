'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { PARK_FAMILIES, CROWD_LEVEL_COLORS, resolveScheduleParkId } from '@/lib/constants';
import { FamilySelector } from '@/components/crowd-calendar/FamilySelector';
import { CalendarDayCell } from '@/components/crowd-calendar/CalendarDayCell';
import { MiniMonth } from '@/components/crowd-calendar/MiniMonth';
import type { CrowdDataQuality, FamilyCrowdMonth, CrowdDay } from '@/types/crowd-calendar';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MIN_DEFENSIBLE_COVERAGE = 0.5;

/**
 * Canonical identity boundary for crowd-calendar data joins.
 *
 * `PARK_FAMILIES` (and therefore `currentFamily.parks[].id`, the park toggle
 * chips, and `/parks/{slug}` links) intentionally key parks by slug, since
 * slugs are the user-facing URL identity. The `/api/crowd-calendar` route,
 * however, now emits real/computed `CrowdDayPark.parkId` (and top-level
 * `parks[].id` / `bestPlan.days[].parkId`) values keyed by the canonical
 * ThemeParks Wiki entity UUID — matching the same slug→UUID resolution
 * `resolveScheduleParkId` already performs for schedule lookups. Firestore
 * cache entries generated before that change (and still within the
 * `/api/crowd-calendar` 6h cache TTL) may still carry the legacy slug-keyed
 * ids for a while during rollout.
 *
 * Every park id coming off the wire is normalized through this single
 * boundary immediately after fetch: a recognized slug is translated to its
 * canonical UUID via `resolveScheduleParkId` (reusing the existing
 * canonical mapping — no new registry, no heuristics); anything that isn't
 * a known slug (i.e. it's already a canonical UUID, or an id we don't
 * recognize at all) passes through unchanged rather than being guessed at.
 * All in-app filtering/grouping (`enabledParks`, `CalendarDayCell`) then
 * operates purely in this normalized id space, while slugs are preserved
 * solely for `/parks/{slug}` links and the family/park picker.
 */
function normalizeParkId(rawId: string): string {
  return resolveScheduleParkId(rawId) ?? rawId;
}

function normalizeFamilyCrowdMonth(data: FamilyCrowdMonth): FamilyCrowdMonth {
  return {
    ...data,
    parks: data.parks.map((p) => ({ ...p, id: normalizeParkId(p.id) })),
    days: data.days.map((day) => ({
      ...day,
      parks: day.parks.map((p) => ({ ...p, parkId: normalizeParkId(p.parkId) })),
    })),
    bestPlan: data.bestPlan
      ? { days: data.bestPlan.days.map((d) => ({ ...d, parkId: normalizeParkId(d.parkId) })) }
      : data.bestPlan,
  };
}

function hasVerifiableQuality(data: FamilyCrowdMonth): data is FamilyCrowdMonth & { dataQuality: CrowdDataQuality } {
  const quality = data.dataQuality;
  return Boolean(
    quality
    && ['historical', 'stale-cache', 'estimated'].includes(quality.source)
    && Number.isFinite(quality.coverageRatio)
    && quality.coverageRatio >= 0
    && quality.coverageRatio <= 1
    && Number.isFinite(quality.daysWithData)
    && Number.isFinite(quality.totalDays)
    && quality.totalDays > 0
  );
}

function describeQuality(data: FamilyCrowdMonth & { dataQuality: CrowdDataQuality }) {
  const quality = data.dataQuality;
  const percent = Math.round(quality.coverageRatio * 100);
  const limited = quality.coverageRatio < MIN_DEFENSIBLE_COVERAGE;

  if (data.stale || quality.source === 'stale-cache') {
    return {
      tone: 'amber' as const,
      title: 'Older historical estimate',
      detail: `Fresh coverage is unavailable. This older estimate covers ${quality.daysWithData} of ${quality.totalDays} days (${percent}%) and is not a live crowd measurement.`,
    };
  }

  if (quality.source === 'estimated' || limited) {
    return {
      tone: 'amber' as const,
      title: 'Limited-data estimate',
      detail: `Historical coverage is ${percent}% (${quality.daysWithData} of ${quality.totalDays} days). Treat these broad estimates as directional, not measured crowd conditions.`,
    };
  }

  return {
    tone: 'blue' as const,
    title: 'Historical estimate',
    detail: `Based on qualifying historical wait-time patterns with ${percent}% day coverage. This is planning guidance, not a live crowd measurement.`,
  };
}

function getMonthStr(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const searchParams = useSearchParams();
  const familyParam = searchParams.get('family');
  const initialFamilyId = (familyParam && PARK_FAMILIES.some((f) => f.id === familyParam))
    ? familyParam
    : PARK_FAMILIES[0].id;

  const now = new Date();
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>(initialFamilyId);
  const [monthOffset, setMonthOffset] = useState(0);
  const [enabledParks, setEnabledParks] = useState<Set<string>>(new Set());
  const [data, setData] = useState<FamilyCrowdMonth | null>(null);
  const [futureData, setFutureData] = useState<FamilyCrowdMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const currentFamily = PARK_FAMILIES.find((f) => f.id === selectedFamilyId) ?? PARK_FAMILIES[0];

  // Calculate current month
  const currentMonth = now.getMonth() + monthOffset;
  const currentYear = now.getFullYear() + Math.floor(currentMonth / 12);
  const normalizedMonth = ((currentMonth % 12) + 12) % 12;
  const monthStr = getMonthStr(currentYear, normalizedMonth);

  // Future months
  const futureMonth1Offset = monthOffset + 1;
  const futureMonth1 = now.getMonth() + futureMonth1Offset;
  const futureYear1 = now.getFullYear() + Math.floor(futureMonth1 / 12);
  const normalizedFutureMonth1 = ((futureMonth1 % 12) + 12) % 12;
  const futureMonthStr1 = getMonthStr(futureYear1, normalizedFutureMonth1);

  const futureMonth2Offset = monthOffset + 2;
  const futureMonth2 = now.getMonth() + futureMonth2Offset;
  const futureYear2 = now.getFullYear() + Math.floor(futureMonth2 / 12);
  const normalizedFutureMonth2 = ((futureMonth2 % 12) + 12) % 12;
  const futureMonthStr2 = getMonthStr(futureYear2, normalizedFutureMonth2);

  // Enable all parks when family changes
  useEffect(() => {
    setEnabledParks(new Set(currentFamily.parks.map((p) => normalizeParkId(p.id))));
  }, [selectedFamilyId]);

  const readVerifiedMonth = useCallback(async (targetMonth: string): Promise<FamilyCrowdMonth> => {
    const res = await fetch(`/api/crowd-calendar?familyId=${selectedFamilyId}&month=${targetMonth}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Crowd calendar returned ${res.status}`);
    }

    const json = await res.json() as FamilyCrowdMonth;
    if (!hasVerifiableQuality(json)) {
      throw new Error('Crowd calendar response did not include verifiable coverage metadata');
    }
    return normalizeFamilyCrowdMonth(json);
  }, [selectedFamilyId]);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setDataError(null);
    setData(null);
    setFutureData([]);

    try {
      const current = await readVerifiedMonth(monthStr);
      if (requestId !== requestIdRef.current) return;
      setData(current);

      const futureResults = await Promise.allSettled([
        readVerifiedMonth(futureMonthStr1),
        readVerifiedMonth(futureMonthStr2),
      ]);
      if (requestId !== requestIdRef.current) return;
      setFutureData(
        futureResults
          .filter((result): result is PromiseFulfilledResult<FamilyCrowdMonth> => result.status === 'fulfilled')
          .map((result) => result.value)
      );
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const message = error instanceof Error ? error.message : '';
      setDataError(
        message.includes('coverage metadata')
          ? 'We can’t verify the historical coverage behind this calendar, so crowd levels are not being shown.'
          : 'The crowd data service could not be reached. No fallback crowd levels are being substituted.'
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [monthStr, futureMonthStr1, futureMonthStr2, readVerifiedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh crowd calendar when user returns to tab after 1 hour
  useAutoRefresh({
    key: `crowd-calendar-${selectedFamilyId}-${monthStr}`,
    staleness: 60 * 60 * 1000, // 1 hour
    onRefresh: async () => {
      await fetchData();
    },
    enabled: !loading,
  });

  const qualityDescription = data && hasVerifiableQuality(data) ? describeQuality(data) : null;

  // Toggle a park on/off
  const togglePark = (parkId: string) => {
    setEnabledParks((prev) => {
      const next = new Set(prev);
      if (next.has(parkId)) next.delete(parkId);
      else next.add(parkId);
      return next;
    });
  };

  // Build the large calendar grid
  const calendarCells = useMemo(() => {
    if (!data) return [];
    const [year, month] = data.month.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    const dayMap = new Map<number, CrowdDay>();
    for (const d of data.days) {
      const dayNum = parseInt(d.date.split('-')[2], 10);
      dayMap.set(dayNum, d);
    }

    const cells: { dayNumber: number | null; crowdDay: CrowdDay | null }[] = [];
    for (let i = 0; i < 42; i++) {
      const dayNum = i - firstDay + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        cells.push({ dayNumber: null, crowdDay: null });
      } else {
        cells.push({ dayNumber: dayNum, crowdDay: dayMap.get(dayNum) ?? null });
      }
    }
    return cells;
  }, [data]);

  const monthLabel = new Date(
    parseInt(monthStr.split('-')[0]),
    parseInt(monthStr.split('-')[1]) - 1
  ).toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 sm:px-6 md:pb-10 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary-900 sm:text-3xl">Crowd Calendar</h1>
        <p className="mt-1 text-sm text-primary-500">
          Compare historical crowd estimates across parks, with coverage clearly labeled.
        </p>
      </div>

      {/* Park family selector */}
      <div className="mb-4">
        <FamilySelector selectedFamilyId={selectedFamilyId} onFamilyChange={setSelectedFamilyId} />
      </div>

      {/* Park toggle chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        {currentFamily.parks.map((park) => {
          const canonicalId = normalizeParkId(park.id);
          const isOn = enabledParks.has(canonicalId);
          return (
            <div key={park.id} className="inline-flex items-center gap-0.5">
              <button
                onClick={() => togglePark(canonicalId)}
                className={`inline-flex items-center gap-1.5 rounded-l-full px-3 py-1.5 text-xs font-medium transition-all ${
                  isOn
                    ? 'bg-primary-100 text-primary-800 ring-1 ring-primary-300'
                    : 'bg-gray-100 text-gray-400 line-through'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isOn ? 'bg-primary-500' : 'bg-gray-300'}`} />
                {park.name}
              </button>
              <Link
                href={`/parks/${park.id}`}
                className={`rounded-r-full px-2 py-1.5 text-xs transition-all hover:bg-primary-200 ${
                  isOn ? 'bg-primary-100 ring-1 ring-primary-300 text-primary-600' : 'bg-gray-100 text-gray-400'
                }`}
                title={`View ${park.name} live wait times`}
              >
                →
              </Link>
            </div>
          );
        })}
      </div>

      {qualityDescription && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 ${
            qualityDescription.tone === 'amber'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-blue-200 bg-blue-50 text-blue-800'
          }`}
          role="status"
        >
          <p className="text-sm font-semibold">{qualityDescription.title}</p>
          <p className="mt-1 text-sm opacity-90">{qualityDescription.detail}</p>
        </div>
      )}

      {dataError && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-5" role="alert">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold text-red-800">Crowd estimates unavailable</p>
              <p className="mt-1 text-sm text-red-700">{dataError}</p>
              <button
                type="button"
                onClick={fetchData}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-red-700 px-4 py-2 text-sm font-medium text-red-700"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Month navigation */}
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setMonthOffset((o) => o - 1)}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-primary-600 hover:bg-primary-50"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <h2 className="text-base font-semibold text-primary-800 sm:text-lg">{monthLabel}</h2>
        <button
          onClick={() => setMonthOffset((o) => o + 1)}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-primary-600 hover:bg-primary-50"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-xl border border-primary-200 bg-white p-4 shadow-sm" role="status">
          <p className="sr-only">Loading crowd estimates</p>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, index) => (
              <div key={index} className="h-16 animate-pulse rounded bg-primary-50 sm:h-20" />
            ))}
          </div>
        </div>
      ) : data ? (
        <>
          {/* Large calendar grid */}
          <div className="overflow-hidden rounded-xl border border-primary-200 bg-white shadow-sm">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 bg-primary-50 text-center">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2 text-[10px] font-semibold uppercase tracking-wide text-primary-500 sm:text-xs">
                  {d}
                </div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7">
              {calendarCells.map((cell, i) => (
                <CalendarDayCell
                  key={i}
                  dayNumber={cell.dayNumber}
                  day={cell.crowdDay}
                  enabledParkIds={enabledParks}
                />
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs">
            {([1, 2, 3, 4] as const).map((level) => (
              <div key={level} className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CROWD_LEVEL_COLORS[level].hex }} />
                <span className="text-primary-600">{CROWD_LEVEL_COLORS[level].label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="inline-flex h-3 items-center rounded bg-red-100 px-1 text-[7px] font-semibold uppercase text-red-700">✕</span>
              <span className="text-primary-600">Closed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full border border-dashed border-gray-300" />
              <span className="text-primary-600">No Data</span>
            </div>
          </div>
        </>
      ) : null}

      {/* Mini future months */}
      {futureData.length > 0 && (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="text-sm font-medium text-primary-600">Upcoming months</h3>
            <p className="text-xs text-primary-400">Historical estimates with verified coverage metadata.</p>
          </div>
          <div className="flex gap-3">
            {futureData.map((fm, i) => (
              <MiniMonth
                key={fm.month}
                month={fm.month}
                days={fm.days}
                onClick={() => setMonthOffset((o) => o + i + 1)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
