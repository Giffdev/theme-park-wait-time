import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crowd Calendar',
  description: 'See predicted crowd levels for every day across major theme parks.',
};

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

export default function CalendarPage() {
  // Generate placeholder data for current month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  const calendarDays = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstDay + 1;
    if (day < 1 || day > daysInMonth) return null;
    // Deterministic pseudo-random crowd level
    const level = ((day * 7 + month * 3) % 10) + 1;
    return { day, level };
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-primary-900">Crowd Calendar</h1>
        <p className="mt-2 text-primary-500">
          Predicted crowd levels based on historical data. Lower is better.
        </p>
      </div>

      {/* Park selector placeholder */}
      <div className="mb-6 flex items-center gap-3">
        <span className="text-sm font-medium text-primary-600">Park:</span>
        <select className="rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-primary-800 focus:border-primary-400 focus:ring-primary-400">
          <option>Magic Kingdom</option>
          <option>EPCOT</option>
          <option>Hollywood Studios</option>
          <option>Animal Kingdom</option>
        </select>
      </div>

      {/* Month header */}
      <div className="mb-4 flex items-center justify-between">
        <button className="rounded-lg p-2 text-primary-600 hover:bg-primary-50">← Prev</button>
        <h2 className="text-lg font-semibold text-primary-800">{monthName}</h2>
        <button className="rounded-lg p-2 text-primary-600 hover:bg-primary-50">Next →</button>
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-xl border border-primary-200">
        <div className="grid grid-cols-7 bg-primary-50 text-center text-xs font-medium text-primary-500">
          {daysOfWeek.map((d) => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarDays.map((cell, i) => (
            <div
              key={i}
              className={`flex min-h-[4rem] flex-col items-center justify-center border-t border-primary-100 p-1.5 text-center ${
                cell ? getCrowdColor(cell.level) : 'bg-white'
              }`}
            >
              {cell && (
                <>
                  <span className="text-xs font-medium">{cell.day}</span>
                  <span className="text-lg font-bold">{cell.level}</span>
                  <span className="text-[10px]">{getCrowdLabel(cell.level)}</span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs">
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
    </div>
  );
}
