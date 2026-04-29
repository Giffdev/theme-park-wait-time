'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useActiveTimer } from '@/hooks/useActiveTimer';
import { stopTimer } from '@/lib/services/timer-service';
import TimerDisplay from './TimerDisplay';

/**
 * Persistent banner at top of page when a queue timer is running.
 * Shows attraction name, elapsed time, and stop button.
 */
export default function QueueTimerBanner() {
  const { user } = useAuth();
  const { timer, isActive } = useActiveTimer();

  if (!user || !isActive || !timer) return null;

  const handleStop = async () => {
    await stopTimer(user.uid);
  };

  // Derive slug for link: use stored parkSlug, or fall back to slugified parkName
  const parkSlug = timer.parkSlug || timer.parkName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  return (
    <div className="relative z-40 bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 sm:px-6">
        <Link
          href={`/parks/${parkSlug}`}
          className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80"
        >
          <span className="animate-pulse text-lg">⏱️</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{timer.attractionName}</p>
            <p className="text-xs text-primary-200">{timer.parkName}</p>
          </div>
          <TimerDisplay startedAt={timer.startedAt} className="!text-white !text-base" />
        </Link>

        <button
          onClick={handleStop}
          className="ml-3 flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition-colors hover:bg-white/30"
        >
          <X className="h-3.5 w-3.5" />
          Stop
        </button>
      </div>
    </div>
  );
}
