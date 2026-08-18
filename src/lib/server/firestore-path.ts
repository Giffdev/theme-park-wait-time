const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const MAX_SEGMENT_LENGTH = 128;

export class InvalidFirestorePathSegmentError extends Error {
  constructor(label: string) {
    super(`Invalid ${label}`);
    this.name = 'InvalidFirestorePathSegmentError';
  }
}

export function assertFirestorePathSegment(value: string, label: string): void {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_SEGMENT_LENGTH
    || value.includes('/')
    || CONTROL_CHARACTERS.test(value)
    || value === '.'
    || value === '..'
  ) {
    throw new InvalidFirestorePathSegmentError(label);
  }
}

export function isFirestorePathSegment(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    assertFirestorePathSegment(value, 'path segment');
    return true;
  } catch {
    return false;
  }
}
