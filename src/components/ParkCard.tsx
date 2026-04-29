'use client';

import Link from 'next/link';
import WaitTimeBadge from './WaitTimeBadge';

interface ParkCardProps {
  id: string;
  name: string;
  destinationName: string;
  shortestWait: number | null;
  attractionCount?: number;
}

export default function ParkCard({ id, name, destinationName, shortestWait, attractionCount }: ParkCardProps) {
  return (
    <Link
      href={`/parks/${id}`}
      className="group flex flex-col justify-between rounded-xl border border-primary-200 bg-white p-5 transition-all hover:border-coral-300 hover:shadow-lg hover:shadow-coral-100/50"
    >
      <div>
        <h3 className="font-semibold text-primary-800 group-hover:text-coral-600">
          {name}
        </h3>
        <p className="mt-1 text-xs text-primary-400">{destinationName}</p>
      </div>
      <div className="mt-4 flex items-end justify-between">
        {shortestWait !== null ? (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-primary-400">Shortest wait</p>
            <WaitTimeBadge waitMinutes={shortestWait} size="sm" />
          </div>
        ) : (
          <span className="text-xs text-primary-300">No live data</span>
        )}
        {attractionCount !== undefined && (
          <span className="text-xs text-primary-400">{attractionCount} rides</span>
        )}
      </div>
    </Link>
  );
}
