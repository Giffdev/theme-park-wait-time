'use client';

import { Ban, XCircle } from 'lucide-react';

export type WaitTimeMode = 'unknown' | 'manual' | 'no-wait' | 'closed';

interface WaitTimeInputProps {
  /** Raw string value for the numeric input (empty = unknown) */
  value: string;
  onChange: (value: string) => void;
  /** Current selection mode */
  mode: WaitTimeMode;
  onModeChange: (mode: WaitTimeMode) => void;
}

/**
 * Unified wait time input with quick-action chips.
 * Default state is "unknown" — empty input, no numeric default.
 * Chips: "No Wait" (0 min walked-on) and "Closed" (attraction was closed).
 */
export default function WaitTimeInput({ value, onChange, mode, onModeChange }: WaitTimeInputProps) {
  const handleChipClick = (chipMode: 'no-wait' | 'closed') => {
    if (mode === chipMode) {
      // Toggle off → back to unknown
      onModeChange('unknown');
      onChange('');
    } else {
      onModeChange(chipMode);
      onChange(chipMode === 'no-wait' ? '0' : '');
    }
  };

  const handleManualInput = (val: string) => {
    onChange(val);
    if (val) {
      onModeChange('manual');
    } else {
      onModeChange('unknown');
    }
  };

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-primary-600">
        Wait Time
      </label>

      {/* Quick-action chips */}
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={() => handleChipClick('no-wait')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
            mode === 'no-wait'
              ? 'bg-green-100 text-green-800 ring-2 ring-green-400 ring-offset-1'
              : 'bg-primary-100 text-primary-600 hover:bg-green-50 hover:text-green-700'
          }`}
          aria-pressed={mode === 'no-wait'}
        >
          <Ban className="h-3.5 w-3.5" />
          No Wait
        </button>
        <button
          type="button"
          onClick={() => handleChipClick('closed')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
            mode === 'closed'
              ? 'bg-red-100 text-red-800 ring-2 ring-red-400 ring-offset-1'
              : 'bg-primary-100 text-primary-600 hover:bg-red-50 hover:text-red-700'
          }`}
          aria-pressed={mode === 'closed'}
        >
          <XCircle className="h-3.5 w-3.5" />
          Closed
        </button>
      </div>

      {/* Numeric input — hidden when closed is selected */}
      {mode !== 'closed' && (
        <div className="relative">
          <input
            type="number"
            min="0"
            max="300"
            value={mode === 'no-wait' ? '0' : value}
            onChange={(e) => handleManualInput(e.target.value)}
            disabled={mode === 'no-wait'}
            placeholder="Enter wait (min)"
            className={`w-full rounded-xl border border-primary-200 px-4 py-3 pr-14 text-lg font-medium placeholder:text-primary-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
              mode === 'no-wait' ? 'bg-green-50 text-green-700' : ''
            }`}
            aria-label="Wait time in minutes"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-primary-400">
            min
          </span>
        </div>
      )}

      {/* Closed state message */}
      {mode === 'closed' && (
        <div className="flex items-center justify-center rounded-xl border border-red-200 bg-red-50/50 px-4 py-3">
          <span className="text-sm font-medium text-red-600">Attraction was closed</span>
        </div>
      )}

      {/* No-wait state hint */}
      {mode === 'no-wait' && (
        <p className="mt-1 text-xs text-green-600">Walk-on — no queue!</p>
      )}
    </div>
  );
}
