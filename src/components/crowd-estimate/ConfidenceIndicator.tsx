'use client';

interface ConfidenceIndicatorProps {
  confidence: 'low' | 'medium' | 'high';
  reportCount: number;
}

/**
 * Visual confidence indicator with dots and tooltip.
 */
export default function ConfidenceIndicator({ confidence, reportCount }: ConfidenceIndicatorProps) {
  const dots = confidence === 'low' ? 1 : confidence === 'medium' ? 2 : 3;

  const label =
    confidence === 'low'
      ? `Based on ${reportCount} report${reportCount !== 1 ? 's' : ''}`
      : confidence === 'medium'
        ? `Based on ${reportCount} reports`
        : `Based on ${reportCount} reports — high confidence`;

  return (
    <div className="group relative inline-flex items-center gap-1" title={label}>
      {Array.from({ length: 3 }, (_, i) => (
        <span
          key={i}
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            i < dots ? 'bg-primary-500' : 'bg-primary-200'
          }`}
        />
      ))}
      {confidence === 'high' && (
        <span className="text-xs text-green-600">✓</span>
      )}

      {/* Tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-primary-900 px-3 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-primary-900" />
      </div>
    </div>
  );
}
