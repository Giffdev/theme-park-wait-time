export interface CanonicalFirestoreTimestamp {
  readonly rfc3339: string;
  readonly seconds: number;
  readonly nanoseconds: number;
}

export interface FirestoreTimestampFields {
  readonly seconds: number;
  readonly nanoseconds: number;
}

export type FirestoreTimestampValue =
  | string
  | Date
  | FirestoreTimestampFields;

const RFC3339_FIRESTORE_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;

const MIN_FIRESTORE_SECONDS = -62_135_596_800;
const MAX_FIRESTORE_SECONDS = 253_402_300_799;

export function parseFirestoreTimestamp(
  value: string,
): CanonicalFirestoreTimestamp | null {
  const match = RFC3339_FIRESTORE_TIMESTAMP.exec(value);
  if (!match) return null;
  const [
    , year, month, day, hour, minute, second, fraction = '',
    , offsetSign, offsetHour = '00', offsetMinute = '00',
  ] = match;
  if (year === '0000') return null;
  if (Number(offsetHour) > 23 || Number(offsetMinute) > 59) return null;
  const wholeSecond = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const localMillis = Date.parse(`${wholeSecond}.000Z`);
  if (!Number.isFinite(localMillis)
      || new Date(localMillis).toISOString().slice(0, 19) !== wholeSecond) {
    return null;
  }
  const offsetMinutes = (Number(offsetHour) * 60 + Number(offsetMinute))
    * (offsetSign === '-' ? -1 : 1);
  const seconds = Math.floor(localMillis / 1_000) - offsetMinutes * 60;
  if (seconds < MIN_FIRESTORE_SECONDS || seconds > MAX_FIRESTORE_SECONDS) return null;
  return {
    rfc3339: value,
    seconds,
    nanoseconds: Number(fraction.padEnd(9, '0')),
  };
}

export function formatFirestoreTimestamp(
  value: FirestoreTimestampFields,
): string | null {
  if (!Number.isSafeInteger(value.seconds)
      || !Number.isInteger(value.nanoseconds)
      || value.nanoseconds < 0
      || value.nanoseconds > 999_999_999) {
    return null;
  }
  const date = new Date(value.seconds * 1_000);
  if (Number.isNaN(date.getTime())) return null;
  const base = date.toISOString().slice(0, 19);
  const fraction = String(value.nanoseconds).padStart(9, '0');
  return `${base}.${fraction}Z`;
}

export function canonicalFirestoreTimestamp(
  value: unknown,
): CanonicalFirestoreTimestamp | null {
  if (typeof value === 'string') return parseFirestoreTimestamp(value);
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : parseFirestoreTimestamp(value.toISOString());
  }
  if (!value || typeof value !== 'object'
      || !('seconds' in value) || !('nanoseconds' in value)) {
    return null;
  }
  const fields = value as Partial<FirestoreTimestampFields>;
  if (typeof fields.seconds !== 'number' || typeof fields.nanoseconds !== 'number') {
    return null;
  }
  const rfc3339 = formatFirestoreTimestamp({
    seconds: fields.seconds,
    nanoseconds: fields.nanoseconds,
  });
  return rfc3339 ? parseFirestoreTimestamp(rfc3339) : null;
}

export function compareFirestoreTimestamps(
  left: CanonicalFirestoreTimestamp,
  right: CanonicalFirestoreTimestamp,
): -1 | 0 | 1 {
  if (left.seconds !== right.seconds) return left.seconds < right.seconds ? -1 : 1;
  if (left.nanoseconds === right.nanoseconds) return 0;
  return left.nanoseconds < right.nanoseconds ? -1 : 1;
}

export function firestoreTimestampToDate(
  value: CanonicalFirestoreTimestamp,
): Date {
  return new Date(value.seconds * 1_000 + Math.floor(value.nanoseconds / 1_000_000));
}
