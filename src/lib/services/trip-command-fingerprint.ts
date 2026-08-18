export interface TripCommandFingerprintFields {
  name: string;
  startDate: string;
  endDate: string;
  parkIds?: string[];
  parkNames?: Record<string, string>;
  status: 'planning' | 'active' | 'completed';
  shareId?: string | null;
  notes: string;
}

function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  }
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalSerialize(
      (value as Record<string, unknown>)[key],
    )}`)
    .join(',')}}`;
}

export function canonicalTripCommandPayload(command: TripCommandFingerprintFields) {
  return {
    name: command.name,
    startDate: command.startDate,
    endDate: command.endDate,
    parkIds: [...(command.parkIds ?? [])],
    parkNames: Object.fromEntries(
      Object.entries(command.parkNames ?? {})
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    status: command.status,
    shareId: command.shareId ?? null,
    notes: command.notes,
  };
}

export async function tripCommandFingerprint(
  command: TripCommandFingerprintFields,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSerialize(canonicalTripCommandPayload(command)));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
