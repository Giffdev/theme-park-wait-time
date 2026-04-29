'use client';

interface CrowdBadgeProps {
  estimateMinutes: number | null;
  reportCount: number;
  confidence: 'low' | 'medium' | 'high';
}

/**
 * Badge showing crowdsourced wait time estimate.
 * Color-coded: green < 20, yellow 20-45, red > 45.
 */
export default function CrowdBadge({ estimateMinutes, reportCount, confidence }: CrowdBadgeProps) {
  if (estimateMinutes === null || reportCount === 0) return null;

  const colorClasses =
    estimateMinutes < 20
      ? 'bg-green-50 text-green-700 border-green-200'
      : estimateMinutes <= 45
        ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
        : 'bg-red-50 text-red-700 border-red-200';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${colorClasses}`}>
      <span>👥</span>
      <span>~{estimateMinutes} min</span>
      {confidence === 'high' && <span className="text-green-600">✓</span>}
      <span className="text-[10px] opacity-60">({reportCount})</span>
    </span>
  );
}
