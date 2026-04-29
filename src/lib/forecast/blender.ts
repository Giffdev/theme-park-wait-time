import type { ForecastEntry } from '@/types/queue';
import type { ForecastAggregate, ForecastMeta } from '@/types/queue';

export interface BlendedForecastResult {
  entries: ForecastEntry[] | null;
  meta: ForecastMeta;
}

const MIN_SAMPLES_THRESHOLD = 15;
const CONFIDENCE_DENOMINATOR = 50;
const MIN_HOUR_SAMPLES = 3;

/**
 * Resolve the best forecast source for an attraction.
 * Live API forecast always wins. Historical fallback only if totalSamples >= 15.
 */
export function resolveForecast(
  liveForecast: ForecastEntry[] | null,
  aggregate: ForecastAggregate | null
): BlendedForecastResult {
  // Live API forecast always wins
  if (liveForecast && liveForecast.length > 0) {
    return {
      entries: liveForecast,
      meta: { source: 'live', confidence: null, dataRange: null },
    };
  }

  // Historical fallback — only if totalSamples >= threshold
  if (aggregate && aggregate.totalSamples >= MIN_SAMPLES_THRESHOLD) {
    const entries = generateForecastFromAggregate(aggregate);
    if (entries.length > 0) {
      const confidence = Math.min(aggregate.totalSamples / CONFIDENCE_DENOMINATOR, 1);
      return {
        entries,
        meta: {
          source: 'historical',
          confidence,
          dataRange: {
            oldest: aggregate.oldestDataDate,
            newest: aggregate.newestDataDate,
            sampleCount: aggregate.totalSamples,
          },
        },
      };
    }
  }

  // Not enough data
  return { entries: null, meta: { source: 'none', confidence: null, dataRange: null } };
}

/**
 * Generate ForecastEntry[] from hourly averages in an aggregate doc.
 * Skips hours with fewer than MIN_HOUR_SAMPLES data points.
 */
function generateForecastFromAggregate(agg: ForecastAggregate): ForecastEntry[] {
  const entries: ForecastEntry[] = [];
  const today = new Date();

  for (const [hour, data] of Object.entries(agg.hourlyAverages)) {
    if (data.sampleCount < MIN_HOUR_SAMPLES) continue;

    const time = new Date(today);
    time.setHours(parseInt(hour, 10), 0, 0, 0);

    entries.push({
      time: time.toISOString(),
      waitTime: Math.round(data.avgWait),
      percentage: 0, // not meaningful for historical data
    });
  }

  return entries.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}
