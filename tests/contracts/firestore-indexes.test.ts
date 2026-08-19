import { describe, expect, it } from 'vitest';
import indexes from '../../firestore.indexes.json';

describe('Firestore index contract', () => {
  it('declares the waitTimeReports attraction recency query index', () => {
    expect(indexes.indexes).toContainEqual({
      collectionGroup: 'waitTimeReports',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'attractionId', order: 'ASCENDING' },
        { fieldPath: 'reportedAt', order: 'DESCENDING' },
      ],
    });
  });

  it('declares the private contributor aggregation query index', () => {
    expect(indexes.indexes).toContainEqual({
      collectionGroup: 'queueReportContributions',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'attractionKey', order: 'ASCENDING' },
        { fieldPath: 'reportedAtMs', order: 'DESCENDING' },
      ],
    });
  });

  it('expires durable trip stats throttle buckets', () => {
    expect(indexes.fieldOverrides).toContainEqual({
      collectionGroup: 'tripStatsRefreshThrottle',
      fieldPath: 'expiresAt',
      ttl: true,
      indexes: [],
    });
  });

  it('expires shared-trip rate-limit buckets', () => {
    expect(indexes.fieldOverrides).toContainEqual({
      collectionGroup: 'sharedTripRateLimits',
      fieldPath: 'expiresAt',
      ttl: true,
      indexes: [],
    });
  });
});
