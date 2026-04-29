'use client';

import WaitTimeBadge from './WaitTimeBadge';
import WaitTimeSparkline from './parks/WaitTimeSparkline';

interface AttractionRowProps {
  name: string;
  entityType: string;
  status: string;
  waitMinutes: number | null;
  onClick?: () => void;
}

const TYPE_BADGES: Record<string, string> = {
  ATTRACTION: 'bg-coral-100 text-coral-700',
  RIDE: 'bg-coral-100 text-coral-700',
  SHOW: 'bg-blue-100 text-blue-700',
  RESTAURANT: 'bg-green-100 text-green-700',
  MEET_AND_GREET: 'bg-sky-100 text-sky-700',
};

export default function AttractionRow({ name, entityType, status, waitMinutes, onClick }: AttractionRowProps) {
  const typeBadgeClass = TYPE_BADGES[entityType] || 'bg-primary-100 text-primary-600';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-primary-50 active:bg-primary-100"
    >
      {/* Name + type badge */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm font-medium text-primary-800 truncate">{name}</span>
        <span className={`hidden sm:inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none ${typeBadgeClass}`}>
          {entityType.replace(/_/g, ' ')}
        </span>
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
