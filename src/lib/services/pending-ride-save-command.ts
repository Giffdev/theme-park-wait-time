import type { RideLogCreateData } from '@/types/ride-log';
import { isValidRideWaitTime } from '@/lib/wait-time-contract';
import {
  loadPendingSaveCommand,
  removePendingSaveCommand,
  replacePendingSaveCommand,
  storePendingSaveCommand,
} from '@/lib/services/pending-save-command-storage';
import type { PendingSaveStorageResult } from '@/lib/services/pending-save-command-storage';

export type PendingRideSaveStage =
  | 'ride-pending'
  | 'report-pending'
  | 'cleanup-pending';

export interface PendingRideSaveCommand {
  requestId: string;
  tripId?: string | null;
  workflowStage?: PendingRideSaveStage;
  data: Omit<RideLogCreateData, 'rodeAt' | 'tripId'> & { rodeAt: string };
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `ride-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function rideSaveContext(
  surface: 'unified' | 'manual' | 'timer' | 'trip',
  discriminator?: string,
): string {
  return `ride:${surface}${discriminator ? `:${encodeURIComponent(discriminator)}` : ''}`;
}

export function isPendingRideSaveCommand(value: unknown): value is PendingRideSaveCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const command = value as Partial<PendingRideSaveCommand>;
  const data = command.data;
  return typeof command.requestId === 'string'
    && /^[A-Za-z0-9_-]{8,128}$/.test(command.requestId)
    && (
      command.tripId === undefined
      || command.tripId === null
      || typeof command.tripId === 'string'
    )
    && (
      command.workflowStage === undefined
      || command.workflowStage === 'ride-pending'
      || command.workflowStage === 'report-pending'
      || command.workflowStage === 'cleanup-pending'
    )
    && Boolean(data)
    && typeof data?.parkId === 'string'
    && data.parkId.length > 0
    && data.parkId.length <= 128
    && typeof data.attractionId === 'string'
    && data.attractionId.length > 0
    && data.attractionId.length <= 128
    && typeof data.parkName === 'string'
    && data.parkName.length <= 200
    && typeof data.attractionName === 'string'
    && data.attractionName.length > 0
    && data.attractionName.length <= 200
    && typeof data.rodeAt === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.rodeAt)
    && !Number.isNaN(new Date(data.rodeAt).getTime())
    && isValidRideWaitTime(data.waitTimeMinutes)
    && typeof data.attractionClosed === 'boolean'
    && (!data.attractionClosed || data.waitTimeMinutes === null)
    && (data.source === 'timer' || data.source === 'manual')
    && (data.rating === null || (
      Number.isInteger(data.rating) && data.rating >= 1 && data.rating <= 5
    ))
    && typeof data.notes === 'string'
    && data.notes.length <= 2000;
}

export function createPendingRideSaveCommand(
  data: RideLogCreateData,
  tripId?: string | null,
): PendingRideSaveCommand {
  return {
    requestId: createRequestId(),
    tripId,
    workflowStage: 'ride-pending',
    data: {
      parkId: data.parkId,
      attractionId: data.attractionId,
      parkName: data.parkName,
      attractionName: data.attractionName,
      rodeAt: data.rodeAt.toISOString(),
      waitTimeMinutes: data.waitTimeMinutes,
      attractionClosed: data.attractionClosed,
      source: data.source,
      rating: data.rating,
      notes: data.notes,
    },
  };
}

export function pendingRideSaveStage(
  command: PendingRideSaveCommand,
): PendingRideSaveStage {
  return command.workflowStage ?? 'ride-pending';
}

export async function persistPendingRideSaveStage(
  uid: string,
  context: string,
  command: PendingRideSaveCommand,
  workflowStage: PendingRideSaveStage,
): Promise<{
  command: PendingRideSaveCommand;
  result: PendingSaveStorageResult;
}> {
  const nextCommand = { ...command, workflowStage };
  return {
    command: nextCommand,
    result: await replacePendingSaveCommand(
      uid,
      context,
      command.requestId,
      nextCommand,
    ),
  };
}

export function restorePendingRideSaveCommand(
  uid: string,
  context: string,
): Promise<PendingRideSaveCommand | null> {
  return loadPendingSaveCommand(uid, context, isPendingRideSaveCommand);
}

export function persistPendingRideSaveCommand(
  uid: string,
  context: string,
  command: PendingRideSaveCommand,
): Promise<PendingSaveStorageResult> {
  return storePendingSaveCommand(uid, context, command);
}

export function clearPendingRideSaveCommand(
  uid: string,
  context: string,
  requestId: string,
) {
  return removePendingSaveCommand(uid, context, requestId);
}

export function rideCommandData(command: PendingRideSaveCommand): RideLogCreateData {
  return { ...command.data, rodeAt: new Date(command.data.rodeAt) };
}
