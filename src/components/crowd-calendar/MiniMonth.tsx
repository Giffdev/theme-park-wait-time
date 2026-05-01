'use client';

import { CROWD_LEVEL_COLORS } from '@/lib/constants';
import type { CrowdDay } from '@/types/crowd-calendar';

interface MiniMonthProps {
  month: string; // YYYY-MM
  days: CrowdDay[];
  onClick: () => void;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type DayState = { type: 'open'; level: 1 | 2 | 3 | 4 } | { type: 'closed' } | { type: 'no_data' };

export function MiniMonth({ month, days, onClick }: MiniMonthProps) {
  const [year, monthNum] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNum - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const monthLabel = new Date(year, monthNum - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  const dayMap = new Map<number, DayState>();
  for (const d of days) {
    const dayNum = parseInt(d.date.split('-')[2], 10);
    const openParks = d.parks.filter((p) => (p.status ?? 'OPEN') === 'OPEN');
    const allClosed = d.parks.length > 0 && openParks.length === 0 &&
      d.parks.every((p) => (p.status ?? 'OPEN') === 'CLOSED');

    if (allClosed) {
      dayMap.set(dayNum, { type: 'closed' });
    } else if (openParks.length === 0) {
      dayMap.set(dayNum, { type: 'no_data' });
    } else {
      dayMap.set(dayNum, { type: 'open', level: d.aggregateCrowdLevel });
    }
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
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
          const state = day ? dayMap.get(day) : undefined;
          let bgStyle: React.CSSProperties | undefined;
          let extraClass = '';

          if (state?.type === 'open') {
            bgStyle = { backgroundColor: CROWD_LEVEL_COLORS[state.level].hex + '40' };
          } else if (state?.type === 'closed') {
            bgStyle = { backgroundColor: '#fecaca' }; // red-200
            extraClass = '';
          } else if (state?.type === 'no_data') {
            extraClass = 'border border-dashed border-gray-300';
          }

          return (
            <div
              key={i}
              className={`flex aspect-square items-center justify-center rounded-[3px] text-[8px] ${extraClass}`}
              style={bgStyle}
            >
              {day && <span className={state?.type === 'closed' ? 'text-red-700' : 'text-primary-600'}>{day}</span>}
            </div>
          );
        })}
      </div>
    </button>
  );
}
