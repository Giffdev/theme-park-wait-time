'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { subscribeToActiveTimer } from '@/lib/services/timer-service';
import type { ActiveTimer } from '@/types/ride-log';

const ABANDONED_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

interface UseActiveTimerReturn {
  timer: ActiveTimer | null;
  isActive: boolean;
  elapsed: number; // seconds
  isAbandoned: boolean;
}

/**
 * Real-time hook for the user's active queue timer.
 * Subscribes via Firestore onSnapshot and ticks elapsed every second.
 */
export function useActiveTimer(): UseActiveTimerReturn {
  const { user } = useAuth();
  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Subscribe to Firestore timer document
  useEffect(() => {
    if (!user) {
      setTimer(null);
      return;
    }

    const unsubscribe = subscribeToActiveTimer(user.uid, (activeTimer) => {
      setTimer(activeTimer);
    });

    return unsubscribe;
  }, [user]);

  // Tick elapsed every second when timer is active
  useEffect(() => {
    if (!timer || timer.status !== 'active') {
      setElapsed(0);
      return;
    }

    const startMs = timer.clientStartedAt || timer.startedAt.getTime();

    const tick = () => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000));
    };

    tick(); // immediate
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const isActive = timer?.status === 'active';
  const isAbandoned = isActive && elapsed * 1000 > ABANDONED_THRESHOLD_MS;

  return { timer, isActive, elapsed, isAbandoned };
}
