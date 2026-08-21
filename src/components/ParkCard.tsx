'use client';

import Link from 'next/link';
import { MapPin, Clock } from 'lucide-react';
import WaitTimeBadge from './WaitTimeBadge';
import type { ParkAvailabilityPhase } from '@/types/park-availability';

interface ParkHours {
  openTime: string;
  closeTime: string;
}

interface ParkCardProps {
  slug: string;
  name: string;
  destinationName: string;
  averageWait: number | null;
  activeRideCount?: number;
  phase?: ParkAvailabilityPhase;
  todayHours?: ParkHours | null;
  timezone?: string;
  localTime?: string;
  location?: string;
}

/** Derive crowd level from average wait across active rides */
function crowdLevel(avg: number): { label: string; className: string } {
  if (avg < 20) return { label: 'Low', className: 'bg-green-100 text-green-700' };
  if (avg < 35) return { label: 'Moderate', className: 'bg-amber-100 text-amber-700' };
  if (avg < 55) return { label: 'Busy', className: 'bg-orange-100 text-orange-700' };
  return { label: 'Packed', className: 'bg-indigo-100 text-indigo-700' };
}

/** Format "09:00" to "9 AM", "21:00" to "9 PM" */
function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  // Normalize hour 24 (midnight boundary from some API implementations) to 0.
  const hNorm = h === 24 ? 0 : h;
  const suffix = hNorm >= 12 ? 'PM' : 'AM';
  const hour12 = hNorm % 12 || 12;
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

/** Whether the phase represents a non-open confirmed state (dims the card). */
function isDimmed(phase: ParkAvailabilityPhase | undefined): boolean {
  return phase === 'CLOSED' || phase === 'UPCOMING';
}

export default function ParkCard({
  slug,
  name,
  destinationName,
  averageWait,
  activeRideCount,
  phase,
  todayHours,
  timezone,
  localTime,
  location,
}: ParkCardProps) {
  const hasPhase = phase !== undefined;
  const dimCard = isDimmed(phase);
  const tz = timezone ? tzAbbr(timezone) : '';

  // Status badge config per phase
  const badge: { label: string; className: string } | null = (() => {
    if (!hasPhase) return null;
    switch (phase) {
      case 'OPEN':
        return { label: 'Open', className: 'bg-green-100 text-green-700' };
      case 'UPCOMING':
        return { label: 'Today', className: 'bg-indigo-100 text-indigo-700' };
      case 'CLOSED':
        return { label: 'Closed', className: 'bg-slate-100 text-slate-500' };
      // ERROR and NO_DATA: never claim a status we don't know
      default:
        return null;
    }
  })();

  return (
    <Link
      href={`/parks/${slug}`}
      className={`group flex flex-col justify-between rounded-xl border p-5 transition-all hover:shadow-lg sm:p-6 ${
        dimCard
          ? 'border-primary-150 bg-primary-50/60 hover:border-primary-300 hover:shadow-primary-100/50'
          : 'border-primary-200 bg-white hover:border-primary-300 hover:shadow-primary-100/50'
      }`}
    >
      {/* Top section: name + status badge */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className={`text-base font-bold leading-tight group-hover:text-indigo-600 sm:text-lg ${dimCard ? 'text-primary-600' : 'text-primary-800'}`}>
            {name}
          </h3>
          {badge && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}
            >
              {badge.label}
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

      {/* Middle section: hours / wait time info */}
      <div className="mt-4 flex items-end justify-between gap-2">
        {phase === 'UPCOMING' ? (
          // Park opens later today - show opening time
          <div className="min-w-0">
            {todayHours ? (
              <p className="text-sm font-medium text-primary-500">
                Opens {formatTime(todayHours.openTime)}{tz ? ` ${tz}` : ''}
              </p>
            ) : (
              <span className="text-sm text-primary-300">Hours unavailable</span>
            )}
          </div>
        ) : phase === 'CLOSED' ? (
          // Park closed for the day; preserve known hours so user knows what time it was open
          <div className="min-w-0">
            {todayHours ? (
              <p className="text-sm font-medium text-primary-500">
                Closed at {formatTime(todayHours.closeTime)}{tz ? ` ${tz}` : ''}
              </p>
            ) : (
              <span className="text-sm text-primary-300">Closed for today</span>
            )}
          </div>
        ) : phase === 'ERROR' || phase === 'NO_DATA' ? (
          // Status unknown - never claim Closed
          <span className="text-sm text-primary-300">Schedule unavailable</span>
        ) : averageWait !== null ? (
          // OPEN or no phase yet with wait data
          <div>
            <p className="text-[11px] uppercase tracking-wider text-primary-400">Avg wait</p>
            <WaitTimeBadge waitMinutes={averageWait} size="sm" />
          </div>
        ) : phase === 'OPEN' && todayHours ? (
          // Open but no live wait data - show hours instead
          <div>
            <p className="text-[11px] uppercase tracking-wider text-primary-400">Live data unavailable</p>
            <p className="text-sm font-medium text-primary-500">
              Open until {formatTime(todayHours.closeTime)}{tz ? ` ${tz}` : ''}
            </p>
          </div>
        ) : (
          <span className="text-sm text-primary-400">Live data unavailable</span>
        )}

        {/* Right: crowd level badge + ride count */}
        <div className="shrink-0 text-right">
          {/* Only show crowd level when open or status is unknown */}
          {averageWait !== null && (phase === 'OPEN' || phase === undefined) && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${crowdLevel(averageWait).className}`}>
              {crowdLevel(averageWait).label}
            </span>
          )}
          {activeRideCount !== undefined && activeRideCount > 0 && (
            <p className="mt-1 text-xs text-primary-400">{activeRideCount} rides</p>
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
