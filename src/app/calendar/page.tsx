'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Thermometer } from 'lucide-react';

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getCrowdColor(level: number): string {
  if (level <= 2) return 'bg-sage-100 text-sage-800';
  if (level <= 4) return 'bg-sage-200 text-sage-900';
  if (level <= 6) return 'bg-accent-100 text-accent-800';
  if (level <= 8) return 'bg-coral-100 text-coral-800';
  return 'bg-coral-200 text-coral-900';
}

function getCrowdLabel(level: number): string {
  if (level <= 2) return 'Very Low';
  if (level <= 4) return 'Low';
  if (level <= 6) return 'Moderate';
  if (level <= 8) return 'High';
  return 'Very High';
}

/** Placeholder temperature data based on Florida climate patterns */
function getTemperature(month: number, day: number): { high: number; low: number } {
  // Base temperatures by month (Orlando, FL historical averages)
  const baseHighs = [71, 73, 78, 83, 88, 91, 92, 92, 90, 84, 77, 72];
  const baseLows = [49, 51, 56, 60, 66, 71, 73, 73, 72, 65, 57, 51];

  // Add deterministic daily variation (±3°F)
  const variation = ((day * 13 + month * 7) % 7) - 3;
  const high = baseHighs[month] + variation;
  const low = baseLows[month] + variation;

  return { high, low };
}

interface CalendarDay {
  day: number;
  level: number;
  high: number;
  low: number;
}

function generateMonthData(year: number, month: number): {
  name: string;
  days: (CalendarDay | null)[];
  firstDay: number;
  daysInMonth: number;
} {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const name = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

  const days = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstDay + 1;
    if (day < 1 || day > daysInMonth) return null;
    const level = ((day * 7 + month * 3) % 10) + 1;
    const { high, low } = getTemperature(month, day);
    return { day, level, high, low };
  });

  return { name, days, firstDay, daysInMonth };
}

function MonthGrid({ name, days }: { name: string; days: (CalendarDay | null)[] }) {
  return (
    <div className="flex-1 min-w-0">
      <h3 className="mb-2 text-center text-sm font-semibold text-primary-800 sm:text-base">
        {name}
      </h3>
      <div className="overflow-hidden rounded-xl border border-primary-200">
        <div className="grid grid-cols-7 bg-primary-50 text-center text-[10px] font-medium text-primary-500 sm:text-xs">
          {daysOfWeek.map((d) => (
            <div key={d} className="py-1 sm:py-1.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((cell, i) => (
            <div
              key={i}
              className={`flex min-h-[4.5rem] flex-col items-center justify-center border-t border-primary-100 p-0.5 text-center sm:min-h-[5rem] sm:p-1 ${
                cell ? getCrowdColor(cell.level) : 'bg-white'
              }`}
            >
              {cell && (
                <>
                  <span className="text-[10px] font-medium leading-tight">{cell.day}</span>
                  <span className="text-sm font-bold leading-tight sm:text-base">{cell.level}</span>
                  <span className="hidden text-[9px] leading-tight sm:inline">{getCrowdLabel(cell.level)}</span>
                  <span className="mt-0.5 flex items-center gap-0.5 text-[9px] leading-tight opacity-70">
                    <Thermometer className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                    <span>{cell.high}°/{cell.low}°</span>
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const now = new Date();
  const [startOffset, setStartOffset] = useState(0);

  const startMonth = now.getMonth() + startOffset;
  const startYear = now.getFullYear() + Math.floor(startMonth / 12);
  const normalizedStart = ((startMonth % 12) + 12) % 12;

  // Generate 3 months of data
  const months = Array.from({ length: 3 }, (_, i) => {
    const m = startMonth + i;
    const y = now.getFullYear() + Math.floor(m / 12);
    const normalM = ((m % 12) + 12) % 12;
    return generateMonthData(y, normalM);
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-primary-900">Crowd Calendar</h1>
        <p className="mt-2 text-primary-500">
          Predicted crowd levels based on historical data. Lower is better.
        </p>
      </div>

      {/* Park selector */}
      <div className="mb-6 flex items-center gap-3">
        <span className="text-sm font-medium text-primary-600">Park:</span>
        <select className="rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-primary-800 focus:border-primary-400 focus:ring-primary-400">
          <option>Magic Kingdom</option>
          <option>EPCOT</option>
          <option>Hollywood Studios</option>
          <option>Animal Kingdom</option>
        </select>
      </div>

      {/* Navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setStartOffset((o) => o - 1)}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-primary-600 hover:bg-primary-50"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Prev</span>
        </button>
        <span className="text-sm font-medium text-primary-700">
          {months[0].name} — {months[2].name}
        </span>
        <button
          onClick={() => setStartOffset((o) => o + 1)}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-primary-600 hover:bg-primary-50"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Multi-month grid — stack on mobile, side by side on desktop */}
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-3">
        {months.map((m) => (
          <MonthGrid key={m.name} name={m.name} days={m.days} />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs">
        {[
          { label: '1-2 Very Low', color: 'bg-sage-100' },
          { label: '3-4 Low', color: 'bg-sage-200' },
          { label: '5-6 Moderate', color: 'bg-accent-100' },
          { label: '7-8 High', color: 'bg-coral-100' },
          { label: '9-10 Very High', color: 'bg-coral-200' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`h-3 w-3 rounded ${item.color}`} />
            <span className="text-primary-600">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Temperature note */}
      <p className="mt-3 text-center text-[10px] text-primary-400">
        <Thermometer className="inline h-3 w-3" /> Temperature shown as historical avg high°/low° (°F)
      </p>
    </div>
  );
}
