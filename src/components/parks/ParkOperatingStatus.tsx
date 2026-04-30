'use client';

import { useMemo } from 'react';
import type { ScheduleSegment } from '@/types/queue';

interface ParkOperatingStatusProps {
  segments: ScheduleSegment[];
  timezone: string;
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

function formatShortTime(isoOrTime: string): string {
  try {
    const date = new Date(isoOrTime);
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
  } catch { /* fall through */ }
  // If it's just "HH:MM"
  const [h, m] = isoOrTime.split(':').map(Number);
  if (!isNaN(h)) {
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`;
  }
  return isoOrTime;
}

export default function ParkOperatingStatus({ segments, timezone }: ParkOperatingStatusProps) {
  const status = useMemo(() => {
    if (!segments || segments.length === 0) return null;

    const now = new Date();
    // Find the OPERATING segment that covers current time
    const operatingSegment = segments.find((seg) => {
      if (seg.type !== 'OPERATING') return false;
      const open = new Date(seg.openingTime);
      const close = new Date(seg.closingTime);
      return now >= open && now < close;
    });

    if (operatingSegment) {
      return {
        isOpen: true,
        closingTime: formatShortTime(operatingSegment.closingTime),
      };
    }

    // Find next opening
    const futureSegments = segments
      .filter((seg) => seg.type === 'OPERATING' && new Date(seg.openingTime) > now)
      .sort((a, b) => new Date(a.openingTime).getTime() - new Date(b.openingTime).getTime());

    return {
      isOpen: false,
      nextOpen: futureSegments.length > 0 ? formatShortTime(futureSegments[0].openingTime) : null,
    };
  }, [segments]);

  if (!status) return null;

  const tz = tzAbbr(timezone);

  if (status.isOpen) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        Open until {status.closingTime} {tz}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
      <span className="h-2 w-2 rounded-full bg-red-400" />
      Closed{status.nextOpen ? ` · Opens ${status.nextOpen} ${tz}` : ''}
    </span>
  );
}
