import { adminDb } from '@/lib/firebase/admin';
import type { ForecastAggregate } from '@/types/queue';

interface Snapshot {
  time: string;
  waitMinutes: number | null;
}

interface HourlyBucket {
  sum: number;
  sumOfSquares: number;
  count: number;
}

/**
 * Update forecast aggregates for a park based on today's archived snapshots.
 * Runs after archiveHistoricalSnapshot in the wait-times API route.
 *
 * Reads today's daily snapshot docs, groups by hour, and merges into the
 * pre-computed aggregate doc for today's day-of-week using incremental averaging.
 */
export async function updateForecastAggregates(
  parkId: string,
  dateStr: string // YYYY-MM-DD
): Promise<void> {
  const dayOfWeek = new Date(dateStr + 'T12:00:00Z').getUTCDay(); // 0=Sunday

  // Read all attraction snapshot docs for today
  const attractionsRef = adminDb
    .collection('waitTimeHistory')
    .doc(parkId)
    .collection('daily')
    .doc(dateStr)
    .collection('attractions');

  const attractionDocs = await attractionsRef.get();

  if (attractionDocs.empty) return;

  const BATCH_SIZE = 499;
  const updates: Array<{
    attractionId: string;
    hourlyBuckets: Record<string, HourlyBucket>;
    totalSnapshots: number;
  }> = [];

  for (const doc of attractionDocs.docs) {
    const data = doc.data() as { snapshots?: Snapshot[] };
    const snapshots = data.snapshots || [];

    // Only aggregate attractions with valid wait time data
    const validSnapshots = snapshots.filter(
      (s) => s.waitMinutes !== null && s.waitMinutes >= 0
    );

    if (validSnapshots.length < 3) continue; // Need ≥3 snapshots to be meaningful

    // Group by hour
    const hourlyBuckets: Record<string, HourlyBucket> = {};

    for (const snap of validSnapshots) {
      const hour = new Date(snap.time).getUTCHours().toString().padStart(2, '0');
      if (!hourlyBuckets[hour]) {
        hourlyBuckets[hour] = { sum: 0, sumOfSquares: 0, count: 0 };
      }
      const bucket = hourlyBuckets[hour];
      bucket.sum += snap.waitMinutes!;
      bucket.sumOfSquares += snap.waitMinutes! * snap.waitMinutes!;
      bucket.count += 1;
    }

    updates.push({
      attractionId: doc.id,
      hourlyBuckets,
      totalSnapshots: validSnapshots.length,
    });
  }

  if (updates.length === 0) return;

  // Read existing aggregates for this day-of-week to do incremental merge
  const aggCollectionRef = adminDb
    .collection('forecastAggregates')
    .doc(parkId)
    .collection('byDayOfWeek')
    .doc(String(dayOfWeek))
    .collection('attractions');

  // Process in batches
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = adminDb.batch();
    const chunk = updates.slice(i, i + BATCH_SIZE);

    // Read existing aggregates for this chunk
    const existingDocs = await Promise.all(
      chunk.map((u) => aggCollectionRef.doc(u.attractionId).get())
    );

    for (let j = 0; j < chunk.length; j++) {
      const update = chunk[j];
      const existingDoc = existingDocs[j];
      const existing = existingDoc.exists
        ? (existingDoc.data() as ForecastAggregate)
        : null;

      // Merge hourly data using incremental averaging
      const mergedHourly: ForecastAggregate['hourlyAverages'] = existing
        ? { ...existing.hourlyAverages }
        : {};

      for (const [hour, bucket] of Object.entries(update.hourlyBuckets)) {
        const todayAvg = bucket.sum / bucket.count;
        const prev = mergedHourly[hour];

        if (prev) {
          // Incremental average: newAvg = oldAvg + (value - oldAvg) / newCount
          const newCount = prev.sampleCount + bucket.count;
          const newAvg =
            prev.avgWait + ((todayAvg - prev.avgWait) * bucket.count) / newCount;

          // Welford's online algorithm for combined stdDev
          // Approximate: combine the variance from existing and new data
          const todayVariance =
            bucket.count > 1
              ? (bucket.sumOfSquares - (bucket.sum * bucket.sum) / bucket.count) /
                (bucket.count - 1)
              : 0;
          const existingVariance = prev.stdDev * prev.stdDev;

          // Pooled variance approximation
          const pooledVariance =
            newCount > 1
              ? ((prev.sampleCount - 1) * existingVariance +
                  (bucket.count - 1) * todayVariance +
                  (prev.sampleCount * bucket.count * (prev.avgWait - todayAvg) ** 2) /
                    newCount) /
                (newCount - 1)
              : 0;

          mergedHourly[hour] = {
            avgWait: Math.round(newAvg * 10) / 10,
            sampleCount: newCount,
            stdDev: Math.round(Math.sqrt(Math.max(0, pooledVariance)) * 10) / 10,
          };
        } else {
          // First time seeing this hour
          const variance =
            bucket.count > 1
              ? (bucket.sumOfSquares - (bucket.sum * bucket.sum) / bucket.count) /
                (bucket.count - 1)
              : 0;

          mergedHourly[hour] = {
            avgWait: Math.round(todayAvg * 10) / 10,
            sampleCount: bucket.count,
            stdDev: Math.round(Math.sqrt(Math.max(0, variance)) * 10) / 10,
          };
        }
      }

      const totalSamples = Object.values(mergedHourly).reduce(
        (sum, h) => sum + h.sampleCount,
        0
      );

      // Resolve attraction name from the daily snapshot doc
      const attractionName = existing?.attractionName || update.attractionId;

      const aggregateDoc: ForecastAggregate = {
        attractionId: update.attractionId,
        attractionName,
        dayOfWeek,
        hourlyAverages: mergedHourly,
        totalSamples,
        lastUpdated: new Date().toISOString(),
        oldestDataDate: existing?.oldestDataDate || dateStr,
        newestDataDate: dateStr,
      };

      batch.set(aggCollectionRef.doc(update.attractionId), aggregateDoc);
    }

    await batch.commit();
  }
}
