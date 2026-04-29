'use client';

import type { ScheduleSegment } from '@/types/queue';

interface ParkScheduleBarProps {
  segments: ScheduleSegment[];
  timezone: string;
}

const SEGMENT_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  OPERATING: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  TICKETED_EVENT: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  EXTRA_HOURS: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
};

function formatScheduleTime(iso: string): string {
  const date = new Date(iso);
  const h = date.getHours();
  const m = date.getMinutes();
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, '0')}${period}`;
}

function getSegmentIcon(type: string, description: string | null): string {
  if (description?.toLowerCase().includes('evening') || description?.toLowerCase().includes('night')) return '🌙';
  if (description?.toLowerCase().includes('early') || description?.toLowerCase().includes('morning')) return '☀️';
  if (type === 'TICKETED_EVENT') return '🎉';
  if (type === 'EXTRA_HOURS') return '✨';
  return '';
}

function getSegmentLabel(segment: ScheduleSegment): string {
  const open = formatScheduleTime(segment.openingTime);
  const close = formatScheduleTime(segment.closingTime);

  if (segment.type === 'OPERATING') {
    return `Open ${open} – ${close}`;
  }

  const icon = getSegmentIcon(segment.type, segment.description);
  const desc = segment.description || (segment.type === 'EXTRA_HOURS' ? 'Extra Hours' : 'Special Event');
  return `${icon} ${desc} ${open} – ${close}`;
}

export default function ParkScheduleBar({ segments, timezone: _timezone }: ParkScheduleBarProps) {
  if (!segments || segments.length === 0) return null;

  // Find LL Multi Pass price from operating segment purchases
  const operatingSegment = segments.find(s => s.type === 'OPERATING');
  const multiPass = operatingSegment?.purchases?.find(p => p.name.toLowerCase().includes('multi pass'));

  // Calculate timeline proportions
  const allTimes = segments.flatMap(s => [new Date(s.openingTime).getTime(), new Date(s.closingTime).getTime()]);
  const dayStart = Math.min(...allTimes);
  const dayEnd = Math.max(...allTimes);
  const dayRange = dayEnd - dayStart || 1;

  return (
    <div className="rounded-xl border border-primary-100 bg-white p-4 space-y-3">
      {/* Timeline bar */}
      <div className="relative h-3 rounded-full bg-primary-50 overflow-hidden" role="img" aria-label="Park schedule timeline">
        {segments.map((segment, i) => {
          const start = new Date(segment.openingTime).getTime();
          const end = new Date(segment.closingTime).getTime();
          const left = ((start - dayStart) / dayRange) * 100;
          const width = ((end - start) / dayRange) * 100;

          const style = SEGMENT_STYLES[segment.type] || SEGMENT_STYLES.OPERATING;

          return (
            <div
              key={i}
              className={`absolute top-0 h-full ${segment.type === 'OPERATING' ? 'bg-blue-300' : segment.type === 'TICKETED_EVENT' ? 'bg-purple-300' : 'bg-amber-300'} rounded-full`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={getSegmentLabel(segment)}
            />
          );
        })}
      </div>

      {/* Labels */}
      <div className="flex flex-wrap gap-2">
        {segments.map((segment, i) => {
          const style = SEGMENT_STYLES[segment.type] || SEGMENT_STYLES.OPERATING;
          return (
            <span
              key={i}
              className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${style.bg} ${style.border} ${style.text}`}
            >
              {getSegmentLabel(segment)}
            </span>
          );
        })}
      </div>

      {/* Lightning Lane Multi Pass price */}
      {multiPass && multiPass.available && (
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-amber-500">⚡</span>
          <span className="font-medium text-primary-700">LL Multi Pass: {multiPass.price.formatted}</span>
        </div>
      )}
    </div>
  );
}
