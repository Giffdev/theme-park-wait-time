'use client';

import { useState } from 'react';
import { Thermometer } from 'lucide-react';
import { CROWD_LEVEL_COLORS } from '@/lib/constants';
import type { CrowdDay } from '@/types/crowd-calendar';

interface CalendarDayCellProps {
  day: CrowdDay | null;
  dayNumber: number | null;
  enabledParkIds: Set<string>;
  month: number; // 0-indexed for temp calc
}

function getTemperature(month: number, day: number): { high: number; low: number } {
  const baseHighs = [71, 73, 78, 83, 88, 91, 92, 92, 90, 84, 77, 72];
  const baseLows = [49, 51, 56, 60, 66, 71, 73, 73, 72, 65, 57, 51];
  const variation = ((day * 13 + month * 7) % 7) - 3;
  return { high: baseHighs[month] + variation, low: baseLows[month] + variation };
}

export function CalendarDayCell({ day, dayNumber, enabledParkIds, month }: CalendarDayCellProps) {
  const [expanded, setExpanded] = useState(false);

  if (dayNumber === null) {
    return <div className="min-h-[4rem] border-t border-primary-100 bg-white sm:min-h-[5.5rem]" />;
  }

  const filteredParks = day?.parks.filter((p) => enabledParkIds.has(p.parkId)) ?? [];
  const temp = getTemperature(month, dayNumber);

  return (
    <>
      <button
        onClick={() => day && setExpanded(true)}
        className="relative flex min-h-[4rem] w-full flex-col border-t border-primary-100 bg-white p-1 text-left transition-colors hover:bg-primary-50/50 sm:min-h-[5.5rem] sm:p-1.5"
      >
        <span className="text-[10px] font-medium text-primary-600 sm:text-xs">{dayNumber}</span>

        {/* Desktop: stacked mini-bars */}
        <div className="mt-0.5 hidden flex-col gap-[3px] sm:flex">
          {filteredParks.map((park) => (
            <div key={park.parkId} className="flex items-center gap-1" title={`${park.parkName}: ${CROWD_LEVEL_COLORS[park.crowdLevel].label}`}>
              <div
                className="h-[5px] rounded-full"
                style={{
                  width: `${(park.crowdLevel / 4) * 100}%`,
                  backgroundColor: CROWD_LEVEL_COLORS[park.crowdLevel].hex,
                }}
              />
              <span className="truncate text-[8px] text-primary-500">{park.parkName.split(' ')[0]}</span>
            </div>
          ))}
        </div>

        {/* Mobile: colored dots */}
        <div className="mt-1 flex flex-wrap gap-[3px] sm:hidden">
          {filteredParks.map((park) => (
            <div
              key={park.parkId}
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: CROWD_LEVEL_COLORS[park.crowdLevel].hex }}
            />
          ))}
        </div>

        {/* Temperature (desktop only) */}
        <div className="mt-auto hidden items-center gap-0.5 text-[8px] text-primary-400 opacity-70 sm:flex">
          <Thermometer className="h-2 w-2" />
          <span>{temp.high}°/{temp.low}°</span>
        </div>
      </button>

      {/* Mobile expanded overlay */}
      {expanded && day && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:hidden"
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-full max-w-lg animate-slide-up rounded-t-2xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-primary-900">
                {new Date(day.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
              <button onClick={() => setExpanded(false)} className="text-primary-400 text-xl">✕</button>
            </div>
            <p className="mb-3 flex items-center gap-1 text-xs text-primary-500">
              <Thermometer className="h-3 w-3" /> {temp.high}°F / {temp.low}°F
            </p>
            <div className="space-y-2">
              {filteredParks.map((park) => (
                <div key={park.parkId} className="flex items-center gap-3 rounded-lg bg-primary-50 px-3 py-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: CROWD_LEVEL_COLORS[park.crowdLevel].hex }}
                  />
                  <span className="flex-1 text-sm font-medium text-primary-800">{park.parkName}</span>
                  <span className="text-xs text-primary-500">{CROWD_LEVEL_COLORS[park.crowdLevel].label}</span>
                  <span className="text-xs text-primary-400">~{park.avgWaitMinutes} min avg</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
