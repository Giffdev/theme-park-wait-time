'use client';

import { useEffect, useState } from 'react';

interface TimerDisplayProps {
  startedAt: Date;
  className?: string;
}

/**
 * Live elapsed time display (MM:SS), color-coded by duration.
 * Green < 30min, Yellow 30-60min, Red > 60min.
 */
export default function TimerDisplay({ startedAt, className = '' }: TimerDisplayProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startMs = startedAt.getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000));

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const colorClass =
    minutes < 30
      ? 'text-green-600'
      : minutes < 60
        ? 'text-yellow-600'
        : 'text-red-600';

  return (
    <span className={`font-mono text-2xl font-bold tabular-nums ${colorClass} ${className}`}>
      {display}
    </span>
  );
}
