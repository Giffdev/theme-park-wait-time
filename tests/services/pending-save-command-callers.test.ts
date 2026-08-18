import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rideCallers = [
  'src/components/UnifiedLogSheet.tsx',
  'src/components/ride-log/ManualLogForm.tsx',
  'src/components/queue-timer/TimerCompleteSheet.tsx',
  'src/app/trips/[tripId]/log/page.tsx',
];

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('pending save command caller contracts', () => {
  it.each(rideCallers)('%s awaits durable add-only persistence before any ride write', (path) => {
    const text = source(path);
    const persistence = text.indexOf('await persistPendingRideSaveCommand(');
    const rejection = text.indexOf('if (!persisted.ok)', persistence);
    const network = [
      text.indexOf('createRideLog(', rejection),
      text.indexOf('addRideLog(', rejection),
    ].filter((index) => index >= 0).sort((left, right) => left - right)[0] ?? -1;

    expect(persistence).toBeGreaterThan(-1);
    expect(rejection).toBeGreaterThan(persistence);
    expect(text.slice(rejection, network)).toMatch(/\breturn;|\bthrow new Error/);
    expect(network).toBeGreaterThan(rejection);
  });

  it.each(rideCallers)('%s awaits request-ID-conditional removal', (path) => {
    const text = source(path);
    expect(text).toContain('await clearPendingRideSaveCommand(');
    expect(text).toMatch(/clearPendingRideSaveCommand\([\s\S]{0,180}requestId/);
  });

  it('trip creation awaits persistence and exact removal before navigation', () => {
    const text = source('src/app/trips/new/page.tsx');
    const persistence = text.indexOf('await storePendingSaveCommand(');
    const rejection = text.indexOf('if (!persisted.ok)', persistence);
    const network = text.indexOf('createTrip(', rejection);
    const completion = text.indexOf('const finishConfirmedTrip');
    const removal = text.indexOf('await removePendingSaveCommand(', completion);
    const navigation = text.indexOf('push(', removal);

    expect(persistence).toBeGreaterThan(-1);
    expect(rejection).toBeGreaterThan(persistence);
    expect(text.slice(rejection, network)).toContain('return;');
    expect(network).toBeGreaterThan(rejection);
    expect(removal).toBeGreaterThan(completion);
    expect(text.slice(removal, navigation)).toContain('requestId');
    expect(navigation).toBeGreaterThan(removal);
    expect(text.slice(network)).toContain(
      'finishConfirmedTrip(command, tripId, commandOwnerUid, runId)',
    );
    const reconciliation = text.indexOf('await reconcileTripCreation(');
    const reconciledCompletion = text.indexOf(
      'await finishConfirmedTrip(command, tripId, ownerUid, runId)',
      reconciliation,
    );
    expect(text.slice(reconciliation, reconciledCompletion))
      .toContain('isConfirmationCurrent(runId, ownerUid, command.requestId)');
  });
});
