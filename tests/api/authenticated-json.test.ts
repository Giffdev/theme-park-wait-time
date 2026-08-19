import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockVerifyIdToken = vi.fn();

vi.mock('@/lib/server/verify-id-token', () => ({
  verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args),
}));

import {
  authenticateRequest,
  readBoundedJson,
  RequestError,
} from '@/lib/server/authenticated-json';

function nextRequest(
  body?: BodyInit | null,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method: 'POST',
    body,
    headers,
  });
}

function streamRequest(
  stream: ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
): NextRequest {
  const request = new Request('http://localhost/api/test', {
    method: 'POST',
    body: stream,
    headers,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' }) as NextRequest;
  if (signal) Object.defineProperty(request, 'signal', { value: signal });
  return request;
}

async function expectRequestError(
  promise: Promise<unknown>,
  status: number,
  message: string,
) {
  await expect(promise).rejects.toMatchObject<RequestError>({ status, message });
}

describe('authenticated request helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-123' });
  });

  it('parses an exact bearer token and returns the verified UID', async () => {
    const request = nextRequest(null, { authorization: 'Bearer token-123' });
    await expect(authenticateRequest(request)).resolves.toBe('user-123');
    expect(mockVerifyIdToken).toHaveBeenCalledWith('token-123');
  });

  it.each([
    undefined,
    '',
    'Basic token',
    'Bearer',
    'Bearer ',
    'bearer token',
    'Bearer token extra',
  ])('rejects missing or malformed bearer value %j', async (authorization) => {
    const request = nextRequest(null, authorization ? { authorization } : {});
    await expectRequestError(
      authenticateRequest(request),
      401,
      'Missing or invalid Authorization header',
    );
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('maps verifier rejection and missing verified UID to 401', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('bad token'));
    await expectRequestError(
      authenticateRequest(nextRequest(null, { authorization: 'Bearer rejected' })),
      401,
      'Invalid or expired token',
    );

    mockVerifyIdToken.mockResolvedValueOnce({});
    await expectRequestError(
      authenticateRequest(nextRequest(null, { authorization: 'Bearer uidless' })),
      401,
      'Invalid or expired token',
    );
  });

  it('bounds uncancellable authentication and suppresses its late rejection', async () => {
    vi.useFakeTimers();
    mockVerifyIdToken.mockReturnValueOnce(new Promise((_, reject) => {
      setTimeout(() => reject(new Error('late private rejection')), 100);
    }));
    const result = authenticateRequest(
      nextRequest(null, { authorization: ['Bearer', 'token-123'].join(' ') }),
      Date.now() + 25,
    );
    const rejection = expectRequestError(result, 503, 'The request deadline elapsed');
    await vi.advanceTimersByTimeAsync(26);
    await rejection;
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it.each([null, [], 'text', 42, true])('rejects non-object JSON %j', async (value) => {
    const raw = JSON.stringify(value);
    await expectRequestError(
      readBoundedJson(nextRequest(raw), 100),
      400,
      'JSON body must be an object',
    );
  });

  it('rejects missing, empty, and malformed bodies', async () => {
    await expectRequestError(
      readBoundedJson(nextRequest(), 100),
      400,
      'Missing request body',
    );
    await expectRequestError(
      readBoundedJson(nextRequest(''), 100),
      400,
      'Invalid JSON body',
    );
    await expectRequestError(
      readBoundedJson(nextRequest('{"broken"'), 100),
      400,
      'Invalid JSON body',
    );
  });

  it('accepts an object at the exact UTF-8 byte limit', async () => {
    const raw = '{"value":"é"}';
    const bytes = new TextEncoder().encode(raw).byteLength;
    await expect(readBoundedJson(nextRequest(raw), bytes))
      .resolves.toEqual({ value: 'é' });
  });

  it('rejects a declared body larger than the limit before reading', async () => {
    await expectRequestError(
      readBoundedJson(nextRequest('{}', { 'content-length': '3' }), 2),
      413,
      'Request body is too large',
    );
  });

  it('counts chunked multibyte UTF-8 bytes and cancels on overflow', async () => {
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"value":"'));
        controller.enqueue(encoder.encode('éé'));
      },
      cancel() {
        cancelled = true;
      },
    });

    await expectRequestError(
      readBoundedJson(streamRequest(stream), 12),
      413,
      'Request body is too large',
    );
    expect(cancelled).toBe(true);
  });

  it('maps request stream failures to invalid JSON without credentials', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('stream failed'));
      },
    });
    await expectRequestError(
      readBoundedJson(streamRequest(stream), 100),
      400,
      'Invalid JSON body',
    );
  });

  it('cancels and rejects an aborted request body', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => {});
      },
      cancel() {
        cancelled = true;
      },
    });
    const result = readBoundedJson(
      streamRequest(stream, {}, controller.signal),
      100,
    );
    controller.abort();

    await expectRequestError(result, 400, 'Request body was aborted');
    expect(cancelled).toBe(true);
  });

  it('cancels a delayed request body at the shared route deadline', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => {});
      },
      cancel() {
        cancelled = true;
      },
    });
    const result = readBoundedJson(
      streamRequest(stream),
      100,
      Date.now() + 25,
    );
    const rejection = expectRequestError(result, 503, 'The request deadline elapsed');
    await vi.advanceTimersByTimeAsync(26);
    await rejection;
    expect(cancelled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
