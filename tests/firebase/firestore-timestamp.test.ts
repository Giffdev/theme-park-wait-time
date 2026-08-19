import { describe, expect, it } from 'vitest';
import {
  canonicalFirestoreTimestamp,
  compareFirestoreTimestamps,
  parseFirestoreTimestamp,
} from '@/lib/firestore-timestamp';

describe('canonical Firestore timestamps', () => {
  it('orders same-millisecond fractions without truncation', () => {
    const earlier = parseFirestoreTimestamp('2026-08-19T01:02:03.123456Z')!;
    const later = parseFirestoreTimestamp('2026-08-19T01:02:03.123999Z')!;
    expect(compareFirestoreTimestamps(earlier, later)).toBe(-1);
    expect(compareFirestoreTimestamps(later, earlier)).toBe(1);
  });

  it('orders across a whole-second boundary', () => {
    const earlier = parseFirestoreTimestamp('2026-08-19T01:02:03.999999999Z')!;
    const later = parseFirestoreTimestamp('2026-08-19T01:02:04Z')!;
    expect(compareFirestoreTimestamps(earlier, later)).toBe(-1);
  });

  it.each([
    ['2026-08-19T01:02:03.123456789Z', '2026-08-18T21:02:03.123456789-04:00'],
    ['1970-01-01T00:00:00Z', '1970-01-01T05:30:00+05:30'],
    ['1969-12-31T23:59:59.999999999Z', '1970-01-01T00:59:59.999999999+01:00'],
  ])('normalizes canonical equivalents %s and %s', (leftText, rightText) => {
    const left = parseFirestoreTimestamp(leftText)!;
    const right = parseFirestoreTimestamp(rightText)!;
    expect(compareFirestoreTimestamps(left, right)).toBe(0);
    expect(right.nanoseconds).toBe(left.nanoseconds);
  });

  it('preserves exact fractions while distinguishing adjacent nanoseconds', () => {
    const earlier = parseFirestoreTimestamp('2026-08-19T01:02:03.000000001+00:00')!;
    const later = parseFirestoreTimestamp('2026-08-19T01:02:03.000000002Z')!;
    expect(earlier.nanoseconds).toBe(1);
    expect(later.nanoseconds).toBe(2);
    expect(compareFirestoreTimestamps(earlier, later)).toBe(-1);
  });

  it('normalizes negative epochs and day boundaries', () => {
    expect(parseFirestoreTimestamp('1970-01-01T00:00:00.5+00:01')).toMatchObject({
      seconds: -60,
      nanoseconds: 500_000_000,
    });
    expect(parseFirestoreTimestamp('2026-01-01T00:00:00+01:00')).toMatchObject({
      seconds: parseFirestoreTimestamp('2025-12-31T23:00:00Z')!.seconds,
      nanoseconds: 0,
    });
  });

  it('accepts legacy millisecond ISO strings and preserves API text exactly', () => {
    const value = '2026-08-19T01:02:03.123Z';
    expect(parseFirestoreTimestamp(value)).toMatchObject({
      rfc3339: value,
      nanoseconds: 123_000_000,
    });
  });

  it.each([
    '2026-08-19T01:02:03.1234567890Z',
    '2026-02-30T01:02:03Z',
    '2026-08-19T24:00:00Z',
    '0000-01-01T00:00:00Z',
    '2026-08-19T01:02:03+24:00',
    '2026-08-19T01:02:03-01:60',
    '0001-01-01T00:00:00+00:01',
    '9999-12-31T23:59:59-00:01',
  ])('strictly rejects malformed or out-of-range value %s', (value) => {
    expect(parseFirestoreTimestamp(value)).toBeNull();
  });

  it('preserves Firestore seconds and nanoseconds', () => {
    expect(canonicalFirestoreTimestamp({
      seconds: 1_776_733_323,
      nanoseconds: 123_456_789,
    })?.rfc3339).toMatch(/\.123456789Z$/);
  });
});
