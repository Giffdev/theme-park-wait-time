'use client';

import { useMemo } from 'react';
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import RideLogEntry from './RideLogEntry';
import type { RideLog } from '@/types/ride-log';

interface RideLogListProps {
  logs: (RideLog & { id: string })[];
  onDelete?: (id: string) => void;
  loading?: boolean;
}

function groupLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d, yyyy');
}

/**
 * Scrollable ride history list, grouped by date.
 */
export default function RideLogList({ logs, onDelete, loading }: RideLogListProps) {
  const grouped = useMemo(() => {
    const groups: { label: string; entries: (RideLog & { id: string })[] }[] = [];
    let currentLabel = '';

    for (const log of logs) {
      const date = log.rodeAt instanceof Date ? log.rodeAt : new Date(log.rodeAt);
      const label = groupLabel(date);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, entries: [] });
      }
      groups[groups.length - 1].entries.push(log);
    }

    return groups;
  }, [logs]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-primary-50" />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 text-5xl">🎢</div>
        <h3 className="text-lg font-semibold text-primary-700">No rides logged yet</h3>
        <p className="mt-2 max-w-xs text-sm text-primary-400">
          Start a queue timer to log your first ride! Your ride history will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map((group) => (
        <div key={group.label}>
          <h3 className="mb-3 text-sm font-semibold text-primary-500 uppercase tracking-wide">
            {group.label}
          </h3>
          <div className="space-y-3">
            {group.entries.map((log) => (
              <RideLogEntry key={log.id} log={log} onDelete={onDelete} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
