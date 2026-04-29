'use client';

import { useEffect, useRef } from 'react';
import { X, Clock, Zap } from 'lucide-react';
import WaitTimeBadge from '@/components/WaitTimeBadge';
import ForecastChart from '@/components/parks/ForecastChart';
import type { QueueData, ForecastEntry, OperatingHoursEntry } from '@/types/queue';

interface RideDetailPanelProps {
  name: string;
  entityType: string;
  status: string;
  waitMinutes: number | null;
  queue?: QueueData | null;
  forecast?: ForecastEntry[] | null;
  operatingHours?: OperatingHoursEntry[] | null;
  onClose: () => void;
}

function formatReturnTime(start: string | null, end: string | null): string {
  if (!start) return 'Checking availability...';
  const s = new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!end) return `${s} onward`;
  const e = new Date(end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${s} – ${e}`;
}

function VirtualQueueDetail({ queue }: { queue: QueueData }) {
  const sections: JSX.Element[] = [];

  if (queue.RETURN_TIME && queue.RETURN_TIME.state !== 'FINISHED') {
    sections.push(
      <div key="ll" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <span className="text-amber-500">⚡</span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-amber-800">Lightning Lane</p>
          <p className="text-xs text-amber-600">
            {queue.RETURN_TIME.state === 'TEMPORARILY_FULL'
              ? 'Temporarily full'
              : formatReturnTime(queue.RETURN_TIME.returnStart, queue.RETURN_TIME.returnEnd)}
          </p>
        </div>
      </div>
    );
  }

  if (queue.PAID_RETURN_TIME && queue.PAID_RETURN_TIME.state !== 'FINISHED') {
    sections.push(
      <div key="ill" className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2">
        <span className="text-yellow-600">💰</span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-yellow-800">
            Individual Lightning Lane{queue.PAID_RETURN_TIME.price ? `: ${queue.PAID_RETURN_TIME.price.formatted}` : ''}
          </p>
          <p className="text-xs text-yellow-600">
            {queue.PAID_RETURN_TIME.state === 'TEMPORARILY_FULL'
              ? 'Temporarily full'
              : formatReturnTime(queue.PAID_RETURN_TIME.returnStart, queue.PAID_RETURN_TIME.returnEnd)}
          </p>
        </div>
      </div>
    );
  }

  if (queue.BOARDING_GROUP) {
    const bg = queue.BOARDING_GROUP;
    sections.push(
      <div key="vq" className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
        <span className="text-purple-500">🎟️</span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-purple-800">Virtual Queue</p>
          <p className="text-xs text-purple-600">
            {bg.state === 'CLOSED' && 'Closed for today'}
            {bg.state === 'PAUSED' && 'Paused — check back later'}
            {bg.state === 'AVAILABLE' && bg.currentGroupStart !== null && (
              <>Now boarding: Groups {bg.currentGroupStart}–{bg.currentGroupEnd}{bg.estimatedWait ? ` (~${bg.estimatedWait} min)` : ''}</>
            )}
            {bg.state === 'AVAILABLE' && bg.currentGroupStart === null && 'Open — join now'}
          </p>
        </div>
      </div>
    );
  }

  if (sections.length === 0) return null;

  return <div className="space-y-2">{sections}</div>;
}

export default function RideDetailPanel({ name, entityType, status, waitMinutes, queue, forecast, operatingHours, onClose }: RideDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ride-detail-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full md:w-96 md:h-full bg-white rounded-t-2xl md:rounded-none shadow-xl animate-slide-up md:animate-none overflow-y-auto max-h-[80vh] md:max-h-full outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-primary-100 bg-white px-5 py-4">
          <h2 id="ride-detail-title" className="text-lg font-bold text-primary-900 truncate pr-2">{name}</h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-primary-400 hover:bg-primary-50 hover:text-primary-700 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5 space-y-6">
          {/* Status + Wait */}
          <div className="flex items-center gap-4">
            <WaitTimeBadge waitMinutes={waitMinutes} size="lg" />
            <div>
              <p className="text-sm font-medium text-primary-600 capitalize">
                {status.toLowerCase().replace(/_/g, ' ')}
              </p>
              <p className="text-xs text-primary-400 mt-0.5">
                {entityType.replace(/_/g, ' ')}
              </p>
            </div>
          </div>

          {/* Virtual Queue Detail */}
          {queue && <VirtualQueueDetail queue={queue} />}

          {/* Forecast Chart */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-primary-400" />
              <h3 className="text-sm font-semibold text-primary-700">Wait Times Today</h3>
            </div>
            <ForecastChart
              forecast={forecast ?? null}
              operatingHours={operatingHours ?? null}
              currentWait={waitMinutes}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
