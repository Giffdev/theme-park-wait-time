'use client';

interface TripDayCardProps {
  date: string;
  parks: { id: string; name: string }[];
  onRemove?: () => void;
}

export default function TripDayCard({ date, parks, onRemove }: TripDayCardProps) {
  const formatted = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="rounded-lg border border-primary-100 bg-primary-50/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📅</span>
          <span className="text-sm font-semibold text-primary-800">{formatted}</span>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="rounded p-1 text-primary-400 hover:bg-primary-100 hover:text-red-500"
            aria-label="Remove day"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {parks.map((p) => (
          <span key={p.id} className="rounded-md bg-white px-2 py-0.5 text-xs text-primary-600 shadow-sm">
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
