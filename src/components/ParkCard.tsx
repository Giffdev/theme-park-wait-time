'use client';

import Link from 'next/link';
import { MapPin, Clock } from 'lucide-react';
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
  location?: string;
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
  location,
}: ParkCardProps) {
  const hasStatus = isOpen !== undefined;
  const tz = timezone ? tzAbbr(timezone) : '';

  return (
    <Link
      href={`/parks/${slug}`}
      className={`group flex flex-col justify-between rounded-xl border p-5 transition-all hover:shadow-lg sm:p-6 ${
        hasStatus && !isOpen
          ? 'border-primary-150 bg-primary-50/60 hover:border-primary-300 hover:shadow-primary-100/50'
          : 'border-primary-200 bg-white hover:border-primary-300 hover:shadow-primary-100/50'
      }`}
    >
      {/* Top section: name + status */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className={`text-base font-bold leading-tight group-hover:text-indigo-600 sm:text-lg ${hasStatus && !isOpen ? 'text-primary-600' : 'text-primary-800'}`}>
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

        {/* Location + meta row */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {location && (
            <span className="inline-flex items-center gap-1 text-xs text-primary-500">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {location}
            </span>
          )}
          {localTime && tz && (
            <span className="inline-flex items-center gap-1 text-xs text-primary-400">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {localTime} {tz}
            </span>
          )}
        </div>
      </div>

      {/* Middle section: wait time / hours info */}
      <div className="mt-4 flex items-end justify-between gap-2">
        {hasStatus && !isOpen ? (
          <div className="min-w-0">
            {todayHours ? (
              <p className="text-sm font-medium text-primary-500">
                Opens {formatTime(todayHours.openTime)}{tz ? ` ${tz}` : ''}
              </p>
            ) : (
              <span className="text-sm text-primary-300">Hours unavailable</span>
            )}
          </div>
        ) : shortestWait !== null ? (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-primary-400">Shortest wait</p>
            <WaitTimeBadge waitMinutes={shortestWait} size="sm" />
          </div>
        ) : hasStatus && isOpen && todayHours ? (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-primary-400">Live data unavailable</p>
            <p className="text-sm font-medium text-primary-500">
              Open until {formatTime(todayHours.closeTime)}{tz ? ` ${tz}` : ''}
            </p>
          </div>
        ) : (
          <span className="text-sm text-primary-400">Live data unavailable</span>
        )}

        {/* Right: attraction count if available */}
        <div className="shrink-0 text-right">
          {attractionCount !== undefined && attractionCount > 0 && (
            <span className="text-xs text-primary-400">{attractionCount} rides</span>
          )}
        </div>
      </div>

      {/* Bottom: View Park action */}
      <div className="mt-4 border-t border-primary-100 pt-3">
        <span className="inline-flex items-center text-sm font-medium text-indigo-600 group-hover:text-indigo-700">
          View Park <span className="ml-1 transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </Link>
  );
}
