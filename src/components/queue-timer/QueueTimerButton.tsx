'use client';

import { useState } from 'react';
import { Timer } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useActiveTimer } from '@/hooks/useActiveTimer';
import { startTimer, stopTimer } from '@/lib/services/timer-service';
import TimerDisplay from './TimerDisplay';
import TimerCompleteSheet from './TimerCompleteSheet';

interface QueueTimerButtonProps {
  parkId: string;
  attractionId: string;
  parkName: string;
  parkSlug?: string;
  attractionName: string;
}

/**
 * Start/stop queue timer button shown on attraction detail pages.
 */
export default function QueueTimerButton({
  parkId,
  attractionId,
  parkName,
  parkSlug,
  attractionName,
}: QueueTimerButtonProps) {
  const { user } = useAuth();
  const { timer, isActive } = useActiveTimer();
  const [loading, setLoading] = useState(false);
  const [completedData, setCompletedData] = useState<{
    elapsedMinutes: number;
    attractionName: string;
    parkId: string;
    attractionId: string;
    parkName: string;
  } | null>(null);

  if (!user) {
    return (
      <button
        disabled
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-100 px-6 py-4 text-sm font-medium text-primary-400"
      >
        <Timer className="h-5 w-5" />
        Sign in to use Queue Timer
      </button>
    );
  }

  const isThisAttraction = timer?.attractionId === attractionId;
  const isOtherAttraction = isActive && !isThisAttraction;

  const handleStart = async () => {
    setLoading(true);
    try {
      await startTimer(user.uid, {
        parkId,
        attractionId,
        parkName,
        parkSlug,
        attractionName,
        clientStartedAt: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const result = await stopTimer(user.uid);
      if (result) {
        setCompletedData({
          elapsedMinutes: result.elapsedMinutes,
          attractionName: result.timer.attractionName,
          parkId: result.timer.parkId,
          attractionId: result.timer.attractionId,
          parkName: result.timer.parkName,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Timer active for a different ride
  if (isOtherAttraction) {
    return (
      <button
        disabled
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-4 text-sm font-medium text-gray-400"
      >
        <Timer className="h-5 w-5" />
        Timer running for {timer?.attractionName}
      </button>
    );
  }

  // Timer active for THIS ride
  if (isActive && isThisAttraction && timer) {
    return (
      <>
        <button
          onClick={handleStop}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-coral-500 to-coral-600 px-6 py-4 text-white shadow-lg shadow-coral-500/30 transition-all hover:shadow-xl hover:shadow-coral-500/40 active:scale-[0.98] disabled:opacity-70"
        >
          <TimerDisplay startedAt={timer.startedAt} className="!text-white !text-lg" />
          <span className="text-lg font-bold">I&apos;m On! 🎢</span>
        </button>

        {completedData && (
          <TimerCompleteSheet
            elapsedMinutes={completedData.elapsedMinutes}
            attractionName={completedData.attractionName}
            parkId={completedData.parkId}
            attractionId={completedData.attractionId}
            parkName={completedData.parkName}
            onClose={() => setCompletedData(null)}
          />
        )}
      </>
    );
  }

  // No timer active — show start button
  return (
    <>
      <button
        onClick={handleStart}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4 text-white shadow-lg shadow-primary-600/30 transition-all hover:shadow-xl hover:shadow-primary-600/40 active:scale-[0.98] disabled:opacity-70"
      >
        <Timer className="h-5 w-5" />
        <span className="text-lg font-bold">Start Queue Timer ⏱️</span>
      </button>

      {completedData && (
        <TimerCompleteSheet
          elapsedMinutes={completedData.elapsedMinutes}
          attractionName={completedData.attractionName}
          parkId={completedData.parkId}
          attractionId={completedData.attractionId}
          parkName={completedData.parkName}
          onClose={() => setCompletedData(null)}
        />
      )}
    </>
  );
}
