'use client';

import Link from 'next/link';
import WaitTimeBadge from './WaitTimeBadge';

interface ParkHours {
  openTime: string;
  closeTime: string;
}

interface ParkCardProps {
  slug: string;
  name: string;
  destinationName: string;
  shortestWait: number | null;
  attractionCount?: number;
  isOpen?: boolean;
  todayHours?: ParkHours | null;
  timezone?: string;
  localTime?: string;
}

/** Format "09:00" → "9 AM", "21:00" → "9 PM" */
function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

/** Map IANA timezone to short abbreviation */
function tzAbbr(tz: string): string {
  const map: Record<string, string> = {
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Denver': 'MT',
    'America/Los_Angeles': 'PT',
    'America/Phoenix': 'MST',
    'Asia/Tokyo': 'JST',
    'Europe/London': 'GMT',
    'Europe/Paris': 'CET',
  };
  return map[tz] || tz.split('/').pop()?.replace(/_/g, ' ') || '';
}

export default function ParkCard({
  slug,
  name,
  destinationName,
  shortestWait,
  attractionCount,
  isOpen,
  todayHours,
  timezone,
  localTime,
}: ParkCardProps) {
  const hasStatus = isOpen !== undefined;
  const tz = timezone ? tzAbbr(timezone) : '';

  return (
    <Link
      href={`/parks/${slug}`}
      className={`group flex flex-col justify-between rounded-xl border p-5 transition-all hover:shadow-lg ${
        hasStatus && !isOpen
          ? 'border-primary-150 bg-primary-50/60 hover:border-primary-300 hover:shadow-primary-100/50'
          : 'border-primary-200 bg-white hover:border-primary-300 hover:shadow-primary-100/50'
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className={`font-semibold group-hover:text-coral-600 ${hasStatus && !isOpen ? 'text-primary-600' : 'text-primary-800'}`}>
            {name}
          </h3>
          {hasStatus && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                isOpen
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {isOpen ? 'Open' : 'Closed'}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-primary-400">{destinationName}</p>
      </div>

      <div className="mt-4 flex items-end justify-between gap-2">
        {/* Left: wait data or status context */}
        {hasStatus && !isOpen ? (
          <div className="min-w-0">
            {todayHours ? (
              <p className="text-xs font-medium text-primary-500">
                Opens {formatTime(todayHours.openTime)}{tz ? ` ${tz}` : ''}
              </p>
            ) : (
              <span className="text-xs text-primary-300">Hours unavailable</span>
            )}
          </div>
        ) : shortestWait !== null ? (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-primary-400">Shortest wait</p>
            <WaitTimeBadge waitMinutes={shortestWait} size="sm" />
          </div>
        ) : hasStatus && isOpen && todayHours ? (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-primary-400">Live data unavailable</p>
            <p className="text-xs font-medium text-primary-500">
              Open until {formatTime(todayHours.closeTime)}{tz ? ` ${tz}` : ''}
            </p>
          </div>
        ) : (
          <span className="text-xs text-primary-400">Live data unavailable</span>
        )}

        {/* Right: local time or attraction count */}
        <div className="shrink-0 text-right">
          {localTime && tz ? (
            <span className="text-[11px] text-primary-400">
              {localTime} {tz}
            </span>
          ) : attractionCount !== undefined ? (
            <span className="text-xs text-primary-400">{attractionCount} rides</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
