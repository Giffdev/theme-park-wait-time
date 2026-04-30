'use client';

import { Star, Clock, Trash2, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { RideLog } from '@/types/ride-log';

interface RideLogEntryProps {
  log: RideLog & { id: string };
  onDelete?: (id: string) => void;
}

/**
 * Single ride log card showing attraction, wait time, rating, and timestamp.
 * Expandable to show notes.
 */
export default function RideLogEntry({ log, onDelete }: RideLogEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const rodeAt = log.rodeAt instanceof Date ? log.rodeAt : new Date(log.rodeAt);
  const timeStr = rodeAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const waitColor =
    log.waitTimeMinutes === null
      ? 'bg-gray-100 text-gray-600'
      : log.waitTimeMinutes < 20
        ? 'bg-green-100 text-green-800'
        : log.waitTimeMinutes <= 45
          ? 'bg-yellow-100 text-yellow-800'
          : 'bg-red-100 text-red-800';

  return (
    <div className="group rounded-2xl border border-primary-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        {/* Ride info */}
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-primary-900 truncate">{log.attractionName}</h4>
          <p className="text-xs text-primary-400">{log.parkName}</p>
        </div>

        {/* Wait time badge */}
        {log.waitTimeMinutes !== null ? (
          <span className={`inline-flex items-baseline gap-0.5 rounded-full px-2.5 py-1 text-sm font-bold ${waitColor}`}>
            {log.waitTimeMinutes}
            <span className="text-[0.6em] font-medium opacity-70">min</span>
          </span>
        ) : (
          <span className="inline-flex items-baseline rounded-full bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-400">
            —
          </span>
        )}
      </div>

      {/* Meta row: time + rating + expand */}
      <div className="mt-2 flex items-center gap-3 text-xs text-primary-400">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeStr}
        </span>

        {log.rating && (
          <span className="flex items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className={`h-3 w-3 ${i < log.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
              />
            ))}
          </span>
        )}

        {log.source === 'timer' && (
          <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-500">
            ⏱️ Timer
          </span>
        )}

        <div className="flex-1" />

        {log.notes && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-0.5 text-primary-400 hover:text-primary-600"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}

        {onDelete && (
          <button
            onClick={() => setShowConfirm(true)}
            className="text-red-400 hover:text-red-600 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Expanded notes */}
      {expanded && log.notes && (
        <div className="mt-3 rounded-xl bg-primary-50 p-3 text-sm text-primary-600">
          {log.notes}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={showConfirm}
        title="Delete Ride Log"
        description={`Delete your "${log.attractionName}" ride log? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          setDeleting(true);
          await onDelete!(log.id);
          setDeleting(false);
          setShowConfirm(false);
        }}
        onCancel={() => setShowConfirm(false)}
        loading={deleting}
      />
    </div>
  );
}
