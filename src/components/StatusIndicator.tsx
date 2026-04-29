'use client';

type RideStatus = 'OPERATING' | 'CLOSED' | 'DOWN' | 'REFURBISHMENT' | string;

interface StatusIndicatorProps {
  status: RideStatus;
  showLabel?: boolean;
}

const STATUS_CONFIG: Record<string, { dot: string; text: string; label: string }> = {
  OPERATING: { dot: 'bg-green-500', text: 'text-green-700', label: 'Operating' },
  CLOSED: { dot: 'bg-gray-400', text: 'text-gray-500', label: 'Closed' },
  DOWN: { dot: 'bg-red-500', text: 'text-red-700', label: 'Down' },
  REFURBISHMENT: { dot: 'bg-yellow-500', text: 'text-yellow-700', label: 'Refurbishment' },
};

export default function StatusIndicator({ status, showLabel = true }: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status] || { dot: 'bg-gray-300', text: 'text-gray-400', label: status };

  return (
    <span className={`inline-flex items-center gap-1.5 ${config.text}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {showLabel && <span className="text-xs font-medium">{config.label}</span>}
    </span>
  );
}
