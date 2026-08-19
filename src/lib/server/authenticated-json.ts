import type { NextRequest } from 'next/server';
import { verifyIdToken } from '@/lib/server/verify-id-token';

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

export const SAVE_ROUTE_DEADLINE_MS = 17_000;

export function createRequestDeadline(now = Date.now()): number {
  return now + SAVE_ROUTE_DEADLINE_MS;
}

function remaining(deadlineAt?: number): number {
  if (deadlineAt === undefined) return SAVE_ROUTE_DEADLINE_MS;
  return Math.max(0, deadlineAt - Date.now());
}

async function withRequestDeadline<T>(
  operation: Promise<T>,
  deadlineAt: number | undefined,
  onTimeout: () => void,
): Promise<T> {
  if (deadlineAt === undefined) return operation;
  const timeoutMs = remaining(deadlineAt);
  if (timeoutMs <= 0) {
    void operation.catch(() => {});
    onTimeout();
    throw new RequestError(503, 'The request deadline elapsed');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout();
          reject(new RequestError(503, 'The request deadline elapsed'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    void operation.catch(() => {});
  }
}

export async function authenticateRequest(
  request: NextRequest,
  deadlineAt?: number,
): Promise<string> {
  const authorization = request.headers.get('authorization');
  const bearer = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!bearer) {
    throw new RequestError(401, 'Missing or invalid Authorization header');
  }
  try {
    // Firebase Admin token verification cannot be physically cancelled. Bound
    // this pre-write await and suppress a late rejection; callers still prevent
    // every write from starting after the overall route deadline.
    const token = await withRequestDeadline(
      verifyIdToken(bearer[1]),
      deadlineAt,
      () => {},
    );
    if (!token.uid) throw new Error('Verified UID missing');
    return token.uid;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(401, 'Invalid or expired token');
  }
}

export async function readBoundedJson<T>(
  request: NextRequest,
  maximumBytes: number,
  deadlineAt?: number,
): Promise<T> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RequestError(413, 'Request body is too large');
  }

  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'Missing request body');
  if (request.signal.aborted) throw new RequestError(400, 'Request body was aborted');
  const decoder = new TextDecoder();
  let raw = '';
  let bytesRead = 0;
  let rejectAbort!: (error: RequestError) => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const handleAbort = () => {
    rejectAbort(new RequestError(400, 'Request body was aborted'));
    void reader.cancel();
  };
  request.signal.addEventListener('abort', handleAbort, { once: true });
  try {
    while (true) {
      const { done, value } = await withRequestDeadline(
        Promise.race([reader.read(), aborted]),
        deadlineAt,
        () => { void reader.cancel(); },
      );
      if (request.signal.aborted) {
        throw new RequestError(400, 'Request body was aborted');
      }
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) {
        await reader.cancel();
        throw new RequestError(413, 'Request body is too large');
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new RequestError(400, 'JSON body must be an object');
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, 'Invalid JSON body');
  } finally {
    request.signal.removeEventListener('abort', handleAbort);
  }
}
