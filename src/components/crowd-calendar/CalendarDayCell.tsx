'use client';

import { useState } from 'react';
import { Thermometer } from 'lucide-react';
import { CROWD_LEVEL_COLORS } from '@/lib/constants';
import type { CrowdDay, CrowdDayPark, ParkDayStatus } from '@/types/crowd-calendar';

interface CalendarDayCellProps {
  day: CrowdDay | null;
  dayNumber: number | null;
  enabledParkIds: Set<string>;
  month: number; // 0-indexed for temp calc
}

function fToC(f: number): number {
  return Math.round((f - 32) * 5 / 9);
}

function getTemperature(month: number, day: number): { high: number; low: number } {
  const baseHighs = [71, 73, 78, 83, 88, 91, 92, 92, 90, 84, 77, 72];
  const baseLows = [49, 51, 56, 60, 66, 71, 73, 73, 72, 65, 57, 51];
  const variation = ((day * 13 + month * 7) % 7) - 3;
  return { high: baseHighs[month] + variation, low: baseLows[month] + variation };
}

/** Resolve park status with backward-compat: missing status = OPEN */
function getParkStatus(park: CrowdDayPark): ParkDayStatus {
  return park.status ?? 'OPEN';
}

export function CalendarDayCell({ day, dayNumber, enabledParkIds, month }: CalendarDayCellProps) {
  const [expanded, setExpanded] = useState(false);

  if (dayNumber === null) {
    return <div className="min-h-[4rem] border-t border-primary-100 bg-white sm:min-h-[5.5rem]" />;
  }

  const filteredParks = day?.parks.filter((p) => enabledParkIds.has(p.parkId)) ?? [];
  const openParks = filteredParks.filter((p) => getParkStatus(p) === 'OPEN');
  const closedParks = filteredParks.filter((p) => getParkStatus(p) === 'CLOSED');
  const noDataParks = filteredParks.filter((p) => getParkStatus(p) === 'NO_DATA');
  const allClosed = filteredParks.length > 0 && openParks.length === 0 && noDataParks.length === 0;
  const temp = getTemperature(month, dayNumber);

  return (
    <>
      <button
        onClick={() => day && setExpanded(true)}
        className={`relative flex min-h-[4rem] w-full flex-col border-t border-primary-100 p-1 text-left transition-colors sm:min-h-[5.5rem] sm:p-1.5 ${
          allClosed
            ? 'bg-gray-50 hover:bg-gray-100'
            : 'bg-white hover:bg-primary-50/50'
        }`}
      >
        <span className="text-[10px] font-medium text-primary-600 sm:text-xs">{dayNumber}</span>

        {/* Desktop: stacked mini-bars + status badges */}
        <div className="mt-0.5 hidden flex-col gap-[3px] sm:flex">
          {filteredParks.map((park) => {
            const status = getParkStatus(park);
            if (status === 'CLOSED') {
              return (
                <div key={park.parkId} className="flex items-center gap-1" title={`${park.parkName}: Closed`}>
                  <span className="inline-flex items-center rounded bg-red-100 px-1 py-px text-[7px] font-semibold uppercase text-red-700">
                    Closed
                  </span>
                  <span className="truncate text-[8px] text-gray-400">{park.parkName.split(' ')[0]}</span>
                </div>
              );
            }
            if (status === 'NO_DATA') {
              return (
                <div key={park.parkId} className="flex items-center gap-1" title={`${park.parkName}: No Data`}>
                  <span className="inline-flex items-center rounded border border-dashed border-gray-300 px-1 py-px text-[7px] text-gray-400">
                    —
                  </span>
                  <span className="truncate text-[8px] text-gray-400">{park.parkName.split(' ')[0]}</span>
                </div>
              );
            }
            return (
              <div key={park.parkId} className="flex items-center gap-1" title={`${park.parkName}: ${park.crowdLevel ? CROWD_LEVEL_COLORS[park.crowdLevel].label : 'Open'}`}>
                <div
                  className="h-[5px] rounded-full"
                  style={{
                    width: `${((park.crowdLevel ?? 1) / 4) * 100}%`,
                    backgroundColor: park.crowdLevel ? CROWD_LEVEL_COLORS[park.crowdLevel].hex : '#94a3b8',
                  }}
                />
                <span className="truncate text-[8px] text-primary-500">{park.parkName.split(' ')[0]}</span>
              </div>
            );
          })}
        </div>

        {/* Mobile: colored dots + status indicators */}
        <div className="mt-1 flex flex-wrap gap-[3px] sm:hidden">
          {filteredParks.map((park) => {
            const status = getParkStatus(park);
            if (status === 'CLOSED') {
              return (
                <div
                  key={park.parkId}
                  className="flex h-2 w-2 items-center justify-center rounded-full bg-red-200"
                  title={`${park.parkName}: Closed`}
                >
                  <span className="text-[5px] font-bold text-red-700">✕</span>
                </div>
              );
            }
            if (status === 'NO_DATA') {
              return (
                <div
                  key={park.parkId}
                  className="h-2 w-2 rounded-full border border-dashed border-gray-300"
                  title={`${park.parkName}: No Data`}
                />
              );
            }
            return (
              <div
                key={park.parkId}
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: park.crowdLevel ? CROWD_LEVEL_COLORS[park.crowdLevel].hex : '#94a3b8' }}
                title={`${park.parkName}: ${park.crowdLevel ? CROWD_LEVEL_COLORS[park.crowdLevel].label : 'Open'}`}
              />
            );
          })}
        </div>

        {/* All-closed badge (mobile readable, min 24px touch target already satisfied by cell) */}
        {allClosed && (
          <span className="mt-0.5 inline-flex items-center self-start rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-tight text-red-700 sm:text-[8px]">
            Closed
          </span>
        )}

        {/* Closed count note for mixed states (desktop) */}
        {closedParks.length > 0 && openParks.length > 0 && (
          <span className="mt-auto hidden text-[7px] text-gray-400 sm:block">
            {closedParks.length} of {filteredParks.length} closed
          </span>
        )}

        {/* Temperature (desktop only) */}
        {!allClosed && (
          <div className="mt-auto hidden items-center gap-0.5 text-[8px] text-primary-400 opacity-70 sm:flex">
            <Thermometer className="h-2 w-2" />
            <span>{temp.high}°/{temp.low}°F ({fToC(temp.high)}°/{fToC(temp.low)}°C)</span>
          </div>
        )}
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
              <Thermometer className="h-3 w-3" /> High {temp.high}°F ({fToC(temp.high)}°C) / Low {temp.low}°F ({fToC(temp.low)}°C)
            </p>

            {/* Mixed state summary */}
            {closedParks.length > 0 && openParks.length > 0 && (
              <p className="mb-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                {closedParks.length} of {filteredParks.length} parks closed this day
              </p>
            )}

            <div className="space-y-2">
              {filteredParks.map((park) => {
                const status = getParkStatus(park);
                if (status === 'CLOSED') {
                  return (
                    <div key={park.parkId} className="flex items-center gap-3 rounded-lg bg-red-50 px-3 py-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100">
                        <span className="text-xs font-bold text-red-600">✕</span>
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-600">{park.parkName}</span>
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Closed</span>
                    </div>
                  );
                }
                if (status === 'NO_DATA') {
                  return (
                    <div key={park.parkId} className="flex items-center gap-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="h-3 w-3 rounded-full border border-dashed border-gray-300" />
                      <span className="flex-1 text-sm font-medium text-gray-500">{park.parkName}</span>
                      <span className="text-xs text-gray-400">No Data</span>
                    </div>
                  );
                }
                return (
                  <div key={park.parkId} className="flex items-center gap-3 rounded-lg bg-primary-50 px-3 py-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: park.crowdLevel ? CROWD_LEVEL_COLORS[park.crowdLevel].hex : '#94a3b8' }}
                    />
                    <span className="flex-1 text-sm font-medium text-primary-800">{park.parkName}</span>
                    <span className="text-xs text-primary-500">{park.crowdLevel ? CROWD_LEVEL_COLORS[park.crowdLevel].label : 'Open'}</span>
                    {park.avgWaitMinutes != null && (
                      <span className="text-xs text-primary-400">~{park.avgWaitMinutes} min avg</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
