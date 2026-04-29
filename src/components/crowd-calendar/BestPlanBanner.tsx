'use client';

import { Calendar } from 'lucide-react';
import { CROWD_LEVEL_COLORS } from '@/lib/constants';
import type { BestPlan } from '@/types/crowd-calendar';

interface BestPlanBannerProps {
  bestPlan: BestPlan | null;
}

function formatDayShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

export function BestPlanBanner({ bestPlan }: BestPlanBannerProps) {
  if (!bestPlan || bestPlan.days.length === 0) return null;

  return (
    <div className="rounded-xl border border-primary-200 bg-gradient-to-r from-primary-50 to-white px-4 py-3 shadow-sm sm:px-5 sm:py-4">
      <div className="flex items-start gap-3">
        <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-primary-800 sm:text-base">
            Best {bestPlan.days.length}-Day Plan
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-sm text-primary-700">
            {bestPlan.days.map((day, i) => (
              <span key={day.date} className="flex items-center gap-1">
                {i > 0 && <span className="mx-1 text-primary-300">→</span>}
                <span className="font-medium">{day.parkName}</span>
                <span className="text-xs text-primary-500">({formatDayShort(day.date)})</span>
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: CROWD_LEVEL_COLORS[day.crowdLevel].hex }}
                />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
