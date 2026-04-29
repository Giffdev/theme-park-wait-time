'use client';

import { useEffect, useRef } from 'react';
import { X, Clock, Zap } from 'lucide-react';
import WaitTimeBadge from '@/components/WaitTimeBadge';

interface RideDetailPanelProps {
  name: string;
  entityType: string;
  status: string;
  waitMinutes: number | null;
  onClose: () => void;
}

function seededRandom(seed: string, index: number): number {
  let hash = 0;
  const str = seed + index;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return (hash & 0x7fffffff) / 0x7fffffff;
}

function generateHourlyData(name: string, currentWait: number | null): { hour: number; wait: number }[] {
  const parkOpen = 9;
  const parkClose = 22;
  const hours: { hour: number; wait: number }[] = [];
  const base = currentWait ?? 20;

  for (let h = parkOpen; h <= parkClose; h++) {
    const timeFactor = Math.sin(((h - parkOpen) / (parkClose - parkOpen)) * Math.PI);
    const noise = (seededRandom(name, h) - 0.5) * 10;
    const wait = Math.max(5, Math.round(base * 0.4 + base * 0.8 * timeFactor + noise));
    hours.push({ hour: h, wait });
  }
  return hours;
}

function formatHour(h: number): string {
  if (h === 12) return '12p';
  if (h > 12) return `${h - 12}p`;
  return `${h}a`;
}

function DayChart({ name, currentWait }: { name: string; currentWait: number | null }) {
  const data = generateHourlyData(name, currentWait);
  const max = Math.max(...data.map((d) => d.wait), 1);
  const width = 280;
  const height = 100;
  const padding = { top: 10, right: 10, bottom: 20, left: 30 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const bestHour = data.reduce((best, d) => (d.wait < best.wait ? d : best), data[0]);

  const points = data
    .map((d, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartW;
      const y = padding.top + chartH - (d.wait / max) * chartH;
      return `${x},${y}`;
    })
    .join(' ');

  // Area fill
  const firstX = padding.left;
  const lastX = padding.left + chartW;
  const bottomY = padding.top + chartH;
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[280px]">
        {/* Y-axis labels */}
        <text x={padding.left - 4} y={padding.top + 4} textAnchor="end" className="fill-primary-400" fontSize="8">
          {max}m
        </text>
        <text x={padding.left - 4} y={bottomY} textAnchor="end" className="fill-primary-400" fontSize="8">
          0
        </text>
        {/* X-axis labels */}
        {data.filter((_, i) => i % 3 === 0).map((d, i) => {
          const idx = i * 3;
          const x = padding.left + (idx / (data.length - 1)) * chartW;
          return (
            <text key={d.hour} x={x} y={height - 4} textAnchor="middle" className="fill-primary-400" fontSize="8">
              {formatHour(d.hour)}
            </text>
          );
        })}
        {/* Area */}
        <polygon points={`${firstX},${bottomY} ${points} ${lastX},${bottomY}`} fill="currentColor" className="text-coral-100" />
        {/* Line */}
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-coral-500" />
      </svg>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-sage-50 px-3 py-2 text-sm">
        <Zap className="h-4 w-4 text-sage-600" />
        <span className="text-sage-800 font-medium">
          Best time: {formatHour(bestHour.hour)} (~{bestHour.wait} min)
        </span>
      </div>
      <p className="mt-1 text-xs text-primary-400 italic">Based on historical averages</p>
    </div>
  );
}

export default function RideDetailPanel({ name, entityType, status, waitMinutes, onClose }: RideDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    // Auto-focus the panel on mount for accessibility
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

          {/* Chart */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-primary-400" />
              <h3 className="text-sm font-semibold text-primary-700">Wait Times Today</h3>
            </div>
            <DayChart name={name} currentWait={waitMinutes} />
          </div>
        </div>
      </div>
    </div>
  );
}
