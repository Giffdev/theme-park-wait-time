'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Clock, Play, Pause, Square, RotateCcw, CheckCircle2, Timer } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { submitWaitTimeReport } from '@/lib/firebase/waitTimeReports';

interface ReportWaitTimeModalProps {
  attractionId: string;
  attractionName: string;
  parkId: string;
  onClose: () => void;
  onSuccess?: (waitTime: number) => void;
}

export default function ReportWaitTimeModal({
  attractionId,
  attractionName,
  parkId,
  onClose,
  onSuccess,
}: ReportWaitTimeModalProps) {
  const { user } = useAuth();

  // Timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerStopped, setTimerStopped] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);

  // Form state
  const [manualMinutes, setManualMinutes] = useState('');
  const [isClosed, setIsClosed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Timer tick
  useEffect(() => {
    if (timerRunning && !timerPaused) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds(
          Math.floor((Date.now() - startTimeRef.current) / 1000) + pausedElapsedRef.current,
        );
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerRunning, timerPaused]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const startTimer = () => {
    startTimeRef.current = Date.now();
    pausedElapsedRef.current = 0;
    setElapsedSeconds(0);
    setTimerRunning(true);
    setTimerPaused(false);
    setTimerStopped(false);
  };

  const pauseTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    pausedElapsedRef.current = elapsedSeconds;
    setTimerPaused(true);
  };

  const resumeTimer = () => {
    startTimeRef.current = Date.now();
    setTimerPaused(false);
  };

  const stopTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimerRunning(false);
    setTimerPaused(false);
    setTimerStopped(true);
  };

  const resetTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setElapsedSeconds(0);
    pausedElapsedRef.current = 0;
    setTimerRunning(false);
    setTimerPaused(false);
    setTimerStopped(false);
  };

  const useTimerResult = () => {
    const minutes = Math.floor(elapsedSeconds / 60);
    setManualMinutes(minutes.toString());
    resetTimer();
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSubmit = useCallback(async () => {
    if (!user) return;
    setError(null);
    setSubmitting(true);

    const waitTime = isClosed ? -1 : parseInt(manualMinutes, 10);

    if (!isClosed && (isNaN(waitTime) || waitTime < 0 || waitTime > 300)) {
      setError('Enter a valid wait time between 0 and 300 minutes.');
      setSubmitting(false);
      return;
    }

    try {
      await submitWaitTimeReport({
        attractionId,
        attractionName,
        parkId,
        userId: user.uid,
        username: user.displayName || user.email || 'Anonymous',
        waitTime,
      });
      setSuccess(true);
      onSuccess?.(waitTime);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  }, [user, isClosed, manualMinutes, attractionId, attractionName, parkId, onClose, onSuccess]);

  // Auth gate: show login prompt if not authenticated
  if (!user) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="relative w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <Clock className="mx-auto h-12 w-12 text-primary-400" />
          <h3 className="mt-4 text-lg font-semibold text-primary-800">Sign in to Report Wait Times</h3>
          <p className="mt-2 text-sm text-primary-500">Help other guests by sharing real-time wait data. Sign in to contribute!</p>
          <div className="mt-5 flex gap-3 justify-center">
            <a href="/auth/signin" className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700">Sign In</a>
            <button onClick={onClose} className="rounded-lg border border-primary-200 px-5 py-2.5 text-sm font-medium text-primary-700 hover:bg-primary-50">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="relative w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <CheckCircle2 className="mx-auto h-16 w-16 text-sage-500" />
          <h3 className="mt-4 text-lg font-semibold text-primary-800">Wait Time Reported!</h3>
          <p className="mt-1 text-sm text-primary-500">
            {isClosed
              ? `${attractionName} marked as closed`
              : `${manualMinutes} min reported for ${attractionName}`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl max-h-[90vh]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-primary-100 bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-primary-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary-500" />
              Report Wait Time
            </h2>
            <p className="text-sm text-primary-500 mt-0.5">{attractionName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-primary-400 hover:bg-primary-50 hover:text-primary-700 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* Timer Section */}
          <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Timer className="h-4 w-4 text-primary-500" />
              <h3 className="text-sm font-semibold text-primary-700">Time Your Wait</h3>
            </div>

            <div className="text-center mb-4">
              <div className="text-4xl font-mono font-bold text-primary-800">
                {formatTimer(elapsedSeconds)}
              </div>
              <p className="text-xs text-primary-400 mt-1">
                {!timerRunning && !timerStopped && 'Start when you join the line'}
                {timerRunning && !timerPaused && 'Timing your wait...'}
                {timerPaused && 'Paused'}
                {timerStopped && 'Timer stopped — use this time or enter manually'}
              </p>
            </div>

            {/* Timer Controls */}
            <div className="flex justify-center gap-2 flex-wrap">
              {!timerRunning && !timerStopped && (
                <button
                  type="button"
                  onClick={startTimer}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
                >
                  <Play className="h-4 w-4" />
                  Start Timer
                </button>
              )}

              {timerRunning && !timerPaused && (
                <>
                  <button
                    type="button"
                    onClick={pauseTimer}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 transition-colors"
                  >
                    <Pause className="h-4 w-4" />
                    Pause
                  </button>
                  <button
                    type="button"
                    onClick={stopTimer}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 transition-colors"
                  >
                    <Square className="h-4 w-4" />
                    Stop
                  </button>
                </>
              )}

              {timerPaused && (
                <>
                  <button
                    type="button"
                    onClick={resumeTimer}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
                  >
                    <Play className="h-4 w-4" />
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={stopTimer}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 transition-colors"
                  >
                    <Square className="h-4 w-4" />
                    Stop
                  </button>
                </>
              )}

              {timerStopped && (
                <>
                  <button
                    type="button"
                    onClick={useTimerResult}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sage-600 px-4 py-2 text-sm font-medium text-white hover:bg-sage-700 transition-colors"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Use {Math.floor(elapsedSeconds / 60)} min
                  </button>
                  <button
                    type="button"
                    onClick={resetTimer}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-primary-200" />
            <span className="text-xs font-medium text-primary-400">OR ENTER MANUALLY</span>
            <div className="flex-1 border-t border-primary-200" />
          </div>

          {/* Manual Entry */}
          <div className="space-y-4">
            {/* Ride Closed Checkbox */}
            <label className="flex items-center gap-3 rounded-lg border border-primary-100 px-4 py-3 cursor-pointer hover:bg-primary-50 transition-colors">
              <input
                type="checkbox"
                checked={isClosed}
                onChange={(e) => {
                  setIsClosed(e.target.checked);
                  if (e.target.checked) setManualMinutes('');
                }}
                className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-primary-800">Ride is closed</span>
                <p className="text-xs text-primary-400">Report this ride as temporarily closed</p>
              </div>
            </label>

            {/* Minutes Input */}
            {!isClosed && (
              <div className="space-y-2">
                <label htmlFor="wait-minutes" className="text-sm font-medium text-primary-700">
                  Wait Time (minutes)
                </label>
                <input
                  id="wait-minutes"
                  type="number"
                  min="0"
                  max="300"
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(e.target.value)}
                  placeholder="e.g. 45"
                  className="w-full rounded-lg border border-primary-200 px-4 py-3 text-center text-2xl font-bold text-primary-800 placeholder:text-primary-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <p className="text-xs text-primary-400 text-center">
                  Enter 0 for walk-on, or your actual wait in minutes
                </p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-primary-200 bg-white px-4 py-2.5 text-sm font-medium text-primary-700 hover:bg-primary-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || (!isClosed && !manualMinutes)}
              className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Submitting...' : isClosed ? 'Report Closed' : 'Submit Report'}
            </button>
          </div>

          {/* Helper text */}
          <p className="text-xs text-center text-primary-400">
            Your report helps other guests plan their visit 🎢
          </p>
        </div>
      </div>
    </div>
  );
}
