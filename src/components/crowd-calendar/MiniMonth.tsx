'use client';

import { CROWD_LEVEL_COLORS } from '@/lib/constants';
import type { CrowdDay } from '@/types/crowd-calendar';

interface MiniMonthProps {
  month: string; // YYYY-MM
  days: CrowdDay[];
  onClick: () => void;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function MiniMonth({ month, days, onClick }: MiniMonthProps) {
  const [year, monthNum] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNum - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const monthLabel = new Date(year, monthNum - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  // Build a lookup map date -> aggregateCrowdLevel
  const dayMap = new Map<number, 1 | 2 | 3 | 4>();
  for (const d of days) {
    const dayNum = parseInt(d.date.split('-')[2], 10);
    dayMap.set(dayNum, d.aggregateCrowdLevel);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to 42
  while (cells.length < 42) cells.push(null);

  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-xl border border-primary-200 p-3 text-left transition-all hover:border-primary-400 hover:shadow-md"
    >
      <h4 className="mb-2 text-center text-xs font-semibold text-primary-700">{monthLabel}</h4>
      <div className="grid grid-cols-7 gap-[2px]">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-[8px] font-medium text-primary-400">{w}</div>
        ))}
        {cells.map((day, i) => {
          const level = day ? dayMap.get(day) : undefined;
          return (
            <div
              key={i}
              className="flex aspect-square items-center justify-center rounded-[3px] text-[8px]"
              style={level ? { backgroundColor: CROWD_LEVEL_COLORS[level].hex + '40' } : undefined}
            >
              {day && <span className="text-primary-600">{day}</span>}
            </div>
          );
        })}
      </div>
    </button>
  );
}
