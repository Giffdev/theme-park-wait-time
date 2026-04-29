'use client';

import { useState } from 'react';
import WaitTimeBadge from './WaitTimeBadge';
import WaitTimeSparkline from './parks/WaitTimeSparkline';
import type { QueueData } from '@/types/queue';

interface AttractionRowProps {
  name: string;
  entityType: string;
  status: string;
  waitMinutes: number | null;
  queue?: QueueData | null;
  onClick?: () => void;
}

const TYPE_BADGES: Record<string, string> = {
  ATTRACTION: 'bg-coral-100 text-coral-700',
  RIDE: 'bg-coral-100 text-coral-700',
  SHOW: 'bg-blue-100 text-blue-700',
  RESTAURANT: 'bg-green-100 text-green-700',
  MEET_AND_GREET: 'bg-sky-100 text-sky-700',
};

function formatReturnWindow(start: string | null, end: string | null): string {
  if (!start) return '';
  const startDate = new Date(start);
  const startStr = startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!end) return `Return: ${startStr}+`;
  const endDate = new Date(end);
  const endStr = endDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Return: ${startStr} – ${endStr}`;
}

function QueueBadges({ queue }: { queue: QueueData }) {
  const [hoveredBadge, setHoveredBadge] = useState<string | null>(null);

  const badges: Array<{ key: string; icon: string; label: string; className: string; tooltip: string }> = [];

  if (queue.RETURN_TIME && queue.RETURN_TIME.state !== 'FINISHED') {
    badges.push({
      key: 'll',
      icon: '⚡',
      label: 'LL',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
      tooltip: formatReturnWindow(queue.RETURN_TIME.returnStart, queue.RETURN_TIME.returnEnd) || 'Lightning Lane available',
    });
  }

  if (queue.PAID_RETURN_TIME && queue.PAID_RETURN_TIME.state !== 'FINISHED') {
    const price = queue.PAID_RETURN_TIME.price?.formatted || '';
    badges.push({
      key: 'ill',
      icon: '💰',
      label: price || 'ILL',
      className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      tooltip: formatReturnWindow(queue.PAID_RETURN_TIME.returnStart, queue.PAID_RETURN_TIME.returnEnd) || `Individual LL${price ? `: ${price}` : ''}`,
    });
  }

  if (queue.BOARDING_GROUP) {
    badges.push({
      key: 'vq',
      icon: '🎟️',
      label: 'VQ',
      className: 'bg-purple-100 text-purple-700 border-purple-200',
      tooltip: queue.BOARDING_GROUP.currentGroupStart !== null
        ? `Groups ${queue.BOARDING_GROUP.currentGroupStart}–${queue.BOARDING_GROUP.currentGroupEnd}`
        : 'Virtual Queue',
    });
  }

  if (badges.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {badges.map((badge) => (
        <span
          key={badge.key}
          className={`relative inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-none cursor-default ${badge.className}`}
          onMouseEnter={() => setHoveredBadge(badge.key)}
          onMouseLeave={() => setHoveredBadge(null)}
          onTouchStart={() => setHoveredBadge(hoveredBadge === badge.key ? null : badge.key)}
          aria-label={badge.tooltip}
        >
          <span>{badge.icon}</span>
          <span className="hidden sm:inline">{badge.label}</span>
          {hoveredBadge === badge.key && badge.tooltip && (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-primary-800 px-2 py-1 text-[10px] text-white shadow-lg z-20">
              {badge.tooltip}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

export default function AttractionRow({ name, entityType, status, waitMinutes, queue, onClick }: AttractionRowProps) {
  const typeBadgeClass = TYPE_BADGES[entityType] || 'bg-primary-100 text-primary-600';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-primary-50 active:bg-primary-100"
    >
      {/* Name + type badge + queue badges */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm font-medium text-primary-800 truncate">{name}</span>
        <span className={`hidden sm:inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none ${typeBadgeClass}`}>
          {entityType.replace(/_/g, ' ')}
        </span>
        {queue && <QueueBadges queue={queue} />}
      </div>

      {/* Sparkline */}
      {status === 'OPERATING' && (
        <WaitTimeSparkline rideName={name} currentWait={waitMinutes} width={60} height={18} />
      )}

      {/* Wait time */}
      <div className="shrink-0 w-16 text-right">
        {status === 'OPERATING' ? (
          <WaitTimeBadge waitMinutes={waitMinutes} size="sm" />
        ) : (
          <span className="text-xs text-primary-300">—</span>
        )}
      </div>
    </button>
  );
}
