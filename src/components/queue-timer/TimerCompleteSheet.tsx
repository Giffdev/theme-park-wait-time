'use client';

import { useState } from 'react';
import { Star, X } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { createRideLog, submitCrowdReport } from '@/lib/services/ride-log-service';

interface TimerCompleteSheetProps {
  elapsedMinutes: number;
  attractionName: string;
  parkId: string;
  attractionId: string;
  parkName: string;
  onClose: () => void;
}

/**
 * Bottom sheet shown after timer stops.
 * Shows wait summary, optional rating/notes, and saves the ride log.
 */
export default function TimerCompleteSheet({
  elapsedMinutes,
  attractionName,
  parkId,
  attractionId,
  parkName,
  onClose,
}: TimerCompleteSheetProps) {
  const { user } = useAuth();
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (skipExtras = false) => {
    if (!user) return;
    setSaving(true);
    try {
      await createRideLog(user.uid, {
        parkId,
        attractionId,
        parkName,
        attractionName,
        rodeAt: new Date(),
        waitTimeMinutes: elapsedMinutes,
        source: 'timer',
        rating: skipExtras ? null : rating,
        notes: skipExtras ? '' : notes,
      });

      // Submit crowd report (fire and forget)
      submitCrowdReport({
        parkId,
        attractionId,
        waitTimeMinutes: elapsedMinutes,
      });

      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => handleSave(true)} />

      {/* Sheet */}
      <div className="relative w-full max-w-md animate-slide-up rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        {/* Close button */}
        <button
          onClick={() => handleSave(true)}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Celebration header */}
        <div className="mb-6 text-center">
          <div className="mb-2 text-4xl">🎢</div>
          <h2 className="text-xl font-bold text-primary-900">
            You waited {elapsedMinutes} minute{elapsedMinutes !== 1 ? 's' : ''}!
          </h2>
          <p className="mt-1 text-sm text-primary-500">for {attractionName}</p>
        </div>

        {/* Star rating */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-primary-700">
            How was the ride?
          </label>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star === rating ? null : star)}
                className="transition-transform hover:scale-110 active:scale-95"
              >
                <Star
                  className={`h-8 w-8 ${
                    rating && star <= rating
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <label htmlFor="ride-notes" className="mb-1 block text-sm font-medium text-primary-700">
            Notes (optional)
          </label>
          <textarea
            id="ride-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How was it? Front row? Any tips?"
            className="w-full resize-none rounded-xl border border-primary-200 px-4 py-3 text-sm placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            rows={3}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="flex-1 rounded-xl border border-primary-200 px-4 py-3 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50 disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save 🎉'}
          </button>
        </div>
      </div>
    </div>
  );
}
