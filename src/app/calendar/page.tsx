'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Thermometer } from 'lucide-react';
import { PARK_FAMILIES, CROWD_LEVEL_COLORS } from '@/lib/constants';
import { FamilySelector } from '@/components/crowd-calendar/FamilySelector';
import { CalendarDayCell } from '@/components/crowd-calendar/CalendarDayCell';
import { MiniMonth } from '@/components/crowd-calendar/MiniMonth';
import type { FamilyCrowdMonth, CrowdDay } from '@/types/crowd-calendar';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Generate deterministic mock data for a park family month */
function generateMockData(familyId: string, monthStr: string): FamilyCrowdMonth {
  const family = PARK_FAMILIES.find((f) => f.id === familyId) ?? PARK_FAMILIES[0];
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  const days: CrowdDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const parks = family.parks.map((park, pi) => {
      // Deterministic crowd based on day, park index, and weekend
      const base = ((d * 7 + pi * 13 + month * 3) % 4) + 1;
      const weekendBoost = isWeekend ? 1 : 0;
      const crowdLevel = Math.min(4, Math.max(1, base + weekendBoost - (d % 3 === 0 ? 1 : 0))) as 1 | 2 | 3 | 4;
      const avgWaitMinutes = crowdLevel * 15 + ((d * pi) % 10);
      return { parkId: park.id, parkName: park.name, crowdLevel, avgWaitMinutes };
    });

    const aggregateCrowdLevel = Math.round(parks.reduce((sum, p) => sum + p.crowdLevel, 0) / parks.length) as 1 | 2 | 3 | 4;
    days.push({ date: dateStr, parks, aggregateCrowdLevel });
  }

  // Generate best 3-day plan: pick the 3 days with lowest crowd, assign parks optimally
  const sortedDays = [...days].sort((a, b) => a.aggregateCrowdLevel - b.aggregateCrowdLevel);
  const bestDays = sortedDays.slice(0, 3);
  const usedParks = new Set<string>();
  const bestPlan = {
    days: bestDays.map((day) => {
      const bestPark = day.parks
        .filter((p) => !usedParks.has(p.parkId))
        .sort((a, b) => a.crowdLevel - b.crowdLevel)[0] ?? day.parks[0];
      usedParks.add(bestPark.parkId);
      return { date: day.date, parkId: bestPark.parkId, parkName: bestPark.parkName, crowdLevel: bestPark.crowdLevel };
    }),
  };

  return {
    familyId: family.id,
    familyName: family.name,
    month: monthStr,
    parks: family.parks.map((p) => ({ id: p.id, name: p.name })),
    days,
    bestPlan,
  };
}

function getMonthStr(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const now = new Date();
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>(PARK_FAMILIES[0].id);
  const [monthOffset, setMonthOffset] = useState(0);
  const [enabledParks, setEnabledParks] = useState<Set<string>>(new Set());
  const [data, setData] = useState<FamilyCrowdMonth | null>(null);
  const [futureData, setFutureData] = useState<FamilyCrowdMonth[]>([]);

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
    setEnabledParks(new Set(currentFamily.parks.map((p) => p.id)));
  }, [selectedFamilyId]);

  // Fetch data (uses mock for now, structured to hit real API)
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/crowd-calendar?familyId=${selectedFamilyId}&month=${monthStr}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        // Fallback to mock data
        setData(generateMockData(selectedFamilyId, monthStr));
      }
    } catch {
      setData(generateMockData(selectedFamilyId, monthStr));
    }

    // Fetch future months
    try {
      const [res1, res2] = await Promise.all([
        fetch(`/api/crowd-calendar?familyId=${selectedFamilyId}&month=${futureMonthStr1}`),
        fetch(`/api/crowd-calendar?familyId=${selectedFamilyId}&month=${futureMonthStr2}`),
      ]);
      const future: FamilyCrowdMonth[] = [];
      if (res1.ok) future.push(await res1.json());
      else future.push(generateMockData(selectedFamilyId, futureMonthStr1));
      if (res2.ok) future.push(await res2.json());
      else future.push(generateMockData(selectedFamilyId, futureMonthStr2));
      setFutureData(future);
    } catch {
      setFutureData([
        generateMockData(selectedFamilyId, futureMonthStr1),
        generateMockData(selectedFamilyId, futureMonthStr2),
      ]);
    }
  }, [selectedFamilyId, monthStr, futureMonthStr1, futureMonthStr2]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const monthLabel = data
    ? new Date(parseInt(data.month.split('-')[0]), parseInt(data.month.split('-')[1]) - 1)
        .toLocaleString('default', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 sm:px-6 md:pb-10 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary-900 sm:text-3xl">Crowd Calendar</h1>
        <p className="mt-1 text-sm text-primary-500">
          Compare crowd levels across parks. Plan the best days for your visit.
        </p>
      </div>

      {/* Park family selector */}
      <div className="mb-4">
        <FamilySelector selectedFamilyId={selectedFamilyId} onFamilyChange={setSelectedFamilyId} />
      </div>

      {/* Park toggle chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        {currentFamily.parks.map((park) => {
          const isOn = enabledParks.has(park.id);
          return (
            <button
              key={park.id}
              onClick={() => togglePark(park.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                isOn
                  ? 'bg-primary-100 text-primary-800 ring-1 ring-primary-300'
                  : 'bg-gray-100 text-gray-400 line-through'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isOn ? 'bg-primary-500' : 'bg-gray-300'}`} />
              {park.name}
            </button>
          );
        })}
      </div>



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
              month={normalizedMonth}
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
        <span className="flex items-center gap-1 text-primary-400">
          <Thermometer className="h-3 w-3" /> Avg temps (°F/°C)
        </span>
      </div>

      {/* Mini future months */}
      {futureData.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-primary-600">Upcoming months</h3>
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
