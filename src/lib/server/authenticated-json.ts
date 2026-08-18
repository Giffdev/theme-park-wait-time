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

export async function authenticateRequest(request: NextRequest): Promise<string> {
  const authorization = request.headers.get('authorization');
  const bearer = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!bearer) {
    throw new RequestError(401, 'Missing or invalid Authorization header');
  }
  try {
    const token = await verifyIdToken(bearer[1]);
    if (!token.uid) throw new Error('Verified UID missing');
    return token.uid;
  } catch {
    throw new RequestError(401, 'Invalid or expired token');
  }
}

export async function readBoundedJson<T>(
  request: NextRequest,
  maximumBytes: number,
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
      const { done, value } = await Promise.race([reader.read(), aborted]);
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
