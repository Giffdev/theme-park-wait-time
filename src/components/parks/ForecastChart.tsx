'use client';

import { useMemo } from 'react';
import { Zap } from 'lucide-react';
import type { ForecastEntry, OperatingHoursEntry } from '@/types/queue';

interface ForecastChartProps {
  forecast: ForecastEntry[] | null;
  operatingHours: OperatingHoursEntry[] | null;
  currentWait: number | null;
  currentTime?: Date;
}

function formatTime(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  if (h === 0) return '12a';
  if (h === 12) return m === 0 ? '12p' : `12:${String(m).padStart(2, '0')}p`;
  if (h > 12) return m === 0 ? `${h - 12}p` : `${h - 12}:${String(m).padStart(2, '0')}p`;
  return m === 0 ? `${h}a` : `${h}:${String(m).padStart(2, '0')}a`;
}

export default function ForecastChart({ forecast, operatingHours, currentWait, currentTime }: ForecastChartProps) {
  const now = currentTime || new Date();

  const chartData = useMemo(() => {
    if (!forecast || forecast.length === 0) return null;

    // Determine time bounds from operatingHours or forecast
    let startMs: number;
    let endMs: number;

    if (operatingHours && operatingHours.length > 0) {
      const opHours = operatingHours.find(h => h.type.toLowerCase().includes('operating'));
      const hours = opHours || operatingHours[0];
      startMs = new Date(hours.startTime).getTime();
      endMs = new Date(hours.endTime).getTime();
    } else {
      startMs = new Date(forecast[0].time).getTime();
      endMs = new Date(forecast[forecast.length - 1].time).getTime();
    }

    const maxWait = Math.max(...forecast.map(f => f.waitTime), 1);
    const bestPoint = forecast.reduce((min, f) => f.waitTime < min.waitTime ? f : min, forecast[0]);

    return { startMs, endMs, maxWait, bestPoint, forecast };
  }, [forecast, operatingHours]);

  if (!chartData) {
    return (
      <div className="flex flex-col items-center justify-center h-[140px] rounded-xl bg-primary-50 border border-primary-100 px-4 text-center">
        <p className="text-sm text-primary-400 italic">Wait time forecast not available</p>
        <p className="text-xs text-primary-300 mt-1">Forecasts are only available for select attractions during park operating hours</p>
      </div>
    );
  }

  const { startMs, endMs, maxWait, bestPoint } = chartData;
  const timeRange = endMs - startMs || 1;

  const width = 400;
  const height = 200;
  const padding = { top: 16, right: 16, bottom: 28, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Build SVG path from forecast points
  const points = forecast!.map(f => {
    const t = new Date(f.time).getTime();
    const x = padding.left + ((t - startMs) / timeRange) * chartW;
    const y = padding.top + chartH - (f.waitTime / maxWait) * chartH;
    return { x, y, time: t, waitTime: f.waitTime };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${padding.top + chartH} L${points[0].x},${padding.top + chartH} Z`;

  // Now line position
  const nowMs = now.getTime();
  const nowX = padding.left + ((nowMs - startMs) / timeRange) * chartW;
  const showNow = nowMs >= startMs && nowMs <= endMs;

  // Current wait dot position
  let currentDot: { x: number; y: number } | null = null;
  if (showNow && currentWait !== null) {
    const dotY = padding.top + chartH - (currentWait / maxWait) * chartH;
    currentDot = { x: nowX, y: Math.max(padding.top, Math.min(padding.top + chartH, dotY)) };
  }

  // Best time position
  const bestTime = new Date(bestPoint.time);
  const bestX = padding.left + ((bestTime.getTime() - startMs) / timeRange) * chartW;
  const bestY = padding.top + chartH - (bestPoint.waitTime / maxWait) * chartH;

  // X-axis labels (every 2-3 hours)
  const labelCount = 5;
  const xLabels = Array.from({ length: labelCount }, (_, i) => {
    const t = startMs + (i / (labelCount - 1)) * timeRange;
    const x = padding.left + (i / (labelCount - 1)) * chartW;
    return { x, label: formatTime(new Date(t)) };
  });

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: '200px' }} role="img" aria-label="Wait time forecast chart">
        <defs>
          <linearGradient id="forecast-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(251, 146, 60)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(251, 146, 60)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y-axis labels */}
        <text x={padding.left - 6} y={padding.top + 4} textAnchor="end" className="fill-primary-400" fontSize="9">
          {maxWait}m
        </text>
        <text x={padding.left - 6} y={padding.top + chartH} textAnchor="end" className="fill-primary-400" fontSize="9">
          0
        </text>
        <text x={padding.left - 6} y={padding.top + chartH / 2 + 3} textAnchor="end" className="fill-primary-300" fontSize="8">
          {Math.round(maxWait / 2)}
        </text>

        {/* Grid lines */}
        <line x1={padding.left} y1={padding.top + chartH / 2} x2={padding.left + chartW} y2={padding.top + chartH / 2}
          stroke="currentColor" strokeWidth="0.5" strokeDasharray="4,4" className="text-primary-100" />

        {/* X-axis labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={height - 6} textAnchor="middle" className="fill-primary-400" fontSize="9">
            {l.label}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#forecast-gradient)" />

        {/* Forecast line */}
        <path d={linePath} fill="none" stroke="rgb(251, 146, 60)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* NOW vertical line */}
        {showNow && (
          <>
            <line x1={nowX} y1={padding.top} x2={nowX} y2={padding.top + chartH}
              stroke="rgb(59, 130, 246)" strokeWidth="1.5" strokeDasharray="4,3" />
            <text x={nowX} y={padding.top - 4} textAnchor="middle" fontSize="8" className="fill-blue-500" fontWeight="600">
              NOW
            </text>
          </>
        )}

        {/* Current wait dot */}
        {currentDot && (
          <circle cx={currentDot.x} cy={currentDot.y} r="5" fill="rgb(59, 130, 246)" stroke="white" strokeWidth="2" />
        )}

        {/* Best time marker */}
        <circle cx={bestX} cy={bestY} r="4" fill="rgb(22, 163, 74)" stroke="white" strokeWidth="1.5" />
      </svg>

      {/* Best time callout */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-sage-50 px-3 py-2 text-sm">
        <Zap className="h-4 w-4 text-sage-600" />
        <span className="text-sage-800 font-medium">
          Best time: {formatTime(bestTime)} (~{bestPoint.waitTime} min)
        </span>
      </div>
    </div>
  );
}
