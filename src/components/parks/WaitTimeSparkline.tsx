'use client';

interface WaitTimeSparklineProps {
  rideName: string;
  currentWait: number | null;
  width?: number;
  height?: number;
}

function seededRandom(seed: string, index: number): number {
  let hash = 0;
  const str = seed + index;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return (hash & 0x7fffffff) / 0x7fffffff;
}

function getSparklineColor(waitMinutes: number | null): string {
  if (waitMinutes === null) return '#9ca3af';
  if (waitMinutes < 20) return '#16a34a';
  if (waitMinutes <= 45) return '#ca8a04';
  return '#dc2626';
}

function generatePlaceholderData(seed: string, currentWait: number | null, points: number = 7): number[] {
  if (currentWait === null) return Array(points).fill(0);
  const data: number[] = [];
  let value = Math.max(5, currentWait * 0.6);
  for (let i = 0; i < points - 1; i++) {
    data.push(Math.round(value));
    const delta = (currentWait - value) / (points - 1 - i) + (seededRandom(seed, i) - 0.5) * 8;
    value = Math.max(0, value + delta);
  }
  data.push(currentWait);
  return data;
}

export default function WaitTimeSparkline({ rideName, currentWait, width = 64, height = 20 }: WaitTimeSparklineProps) {
  if (currentWait === null) return null;

  const data = generatePlaceholderData(rideName, currentWait);
  const color = getSparklineColor(currentWait);
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const padding = 2;

  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - ((v - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
