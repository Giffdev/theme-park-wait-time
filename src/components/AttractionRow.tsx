'use client';

import WaitTimeBadge from './WaitTimeBadge';
import StatusIndicator from './StatusIndicator';

interface AttractionRowProps {
  name: string;
  entityType: string;
  status: string;
  waitMinutes: number | null;
}

const TYPE_BADGES: Record<string, string> = {
  ATTRACTION: 'bg-coral-100 text-coral-700',
  RIDE: 'bg-coral-100 text-coral-700',
  SHOW: 'bg-purple-100 text-purple-700',
  RESTAURANT: 'bg-amber-100 text-amber-700',
  MEET_AND_GREET: 'bg-sky-100 text-sky-700',
};

export default function AttractionRow({ name, entityType, status, waitMinutes }: AttractionRowProps) {
  const typeBadgeClass = TYPE_BADGES[entityType] || 'bg-primary-100 text-primary-600';

  return (
    <div className="flex items-center justify-between rounded-lg border border-primary-100 bg-white p-4 transition-colors hover:bg-primary-50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-primary-800 truncate">{name}</h3>
          <span className={`hidden sm:inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${typeBadgeClass}`}>
            {entityType.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="mt-1">
          <StatusIndicator status={status} />
        </div>
      </div>
      <div className="ml-4 shrink-0">
        {status === 'OPERATING' ? (
          <WaitTimeBadge waitMinutes={waitMinutes} size="md" />
        ) : (
          <span className="text-sm text-primary-300">—</span>
        )}
      </div>
    </div>
  );
}
