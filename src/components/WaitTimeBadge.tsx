'use client';

interface WaitTimeBadgeProps {
  waitMinutes: number | null;
  size?: 'sm' | 'md' | 'lg';
}

export default function WaitTimeBadge({ waitMinutes, size = 'md' }: WaitTimeBadgeProps) {
  if (waitMinutes === null || waitMinutes === undefined) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-500">
        N/A
      </span>
    );
  }

  const color =
    waitMinutes < 20
      ? 'bg-green-100 text-green-800'
      : waitMinutes <= 45
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-amber-100 text-amber-800';

  const sizeClasses = {
    sm: 'text-sm px-2 py-0.5',
    md: 'text-lg px-3 py-1',
    lg: 'text-3xl px-4 py-2',
  };

  return (
    <span className={`inline-flex items-baseline gap-1 rounded-full font-bold ${color} ${sizeClasses[size]}`}>
      {waitMinutes}
      <span className="text-[0.5em] font-medium opacity-70">min</span>
    </span>
  );
}
