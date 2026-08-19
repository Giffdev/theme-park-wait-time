import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('@/lib/firebase/admin', () => ({
  adminProjectId: 'default-test-project',
  getAdminServiceAccount: vi.fn(),
}));

import {
  batchGetFirestoreDocuments,
  commitFirestoreDocuments,
  createServiceAccountAccessTokenProvider,
  encodeFirestoreUrlPath,
  encodeFirestoreRestValue,
  FirestoreRestCommitError,
  QUERY_REPRESENTATION_MULTIPLIER,
  runFirestoreEqualityQuery,
} from '@/lib/firebase/firestore-rest-commit';

function testServiceAccount() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    project_id: 'test-project',
    client_email: 'test-service-account@test-project.iam.gserviceaccount.com',
    private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    token_uri: 'https://oauth2.googleapis.com/token',
  };
}

function tokenResponse(accessToken = 'test-access-token', expiresIn = 3_600) {
  return new Response(JSON.stringify({
    access_token: accessToken,
    expires_in: expiresIn,
    token_type: 'Bearer',
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Firestore REST commit transport', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('encodes supported values and sends atomic create-only writes with transforms', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await commitFirestoreDocuments([
      {
        path: 'users/user name/trips/trip%id',
        fields: {
          string: 'value',
          integer: 42,
          double: 1.5,
          truthy: true,
          nothing: null,
          date: new Date('2026-08-18T12:34:56.789Z'),
          timestamp: new Timestamp(1_776_170_096, 789_123_000),
          bytes: Uint8Array.from([1, 2, 3]),
          array: ['a', 2],
          map: { nested: false },
          emptyArray: [],
          emptyMap: {},
        },
        serverTimestampFields: ['createdAt', 'field.with.dot'],
      },
      {
        path: 'users/user name/tripCreateCommands/trip%id',
        fields: { targetId: 'trip%id' },
        serverTimestampFields: ['createdAt'],
      },
    ], {
      fetch: fetchMock,
      tokenFetch: vi.fn().mockResolvedValue(tokenResponse()),
      serviceAccount: testServiceAccount(),
      projectId: 'project-id',
      emulatorHost: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://firestore.googleapis.com/v1/projects/project-id/databases/(default)/documents:commit',
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const request = JSON.parse(String(init.body));
    expect(request.writes).toHaveLength(2);
    expect(request.writes.every((write: { currentDocument: unknown }) => (
      JSON.stringify(write.currentDocument) === JSON.stringify({ exists: false })
    ))).toBe(true);
    expect(request.writes[0].update.name).toBe(
      'projects/project-id/databases/(default)/documents/users/user name/trips/trip%id',
    );
    expect(request.writes[0].update.fields).toMatchObject({
      string: { stringValue: 'value' },
      integer: { integerValue: '42' },
      double: { doubleValue: 1.5 },
      truthy: { booleanValue: true },
      nothing: { nullValue: null },
      date: { timestampValue: '2026-08-18T12:34:56.789Z' },
      timestamp: { timestampValue: '2026-04-14T12:34:56.789123Z' },
      bytes: { bytesValue: 'AQID' },
      array: { arrayValue: { values: [{ stringValue: 'a' }, { integerValue: '2' }] } },
      map: { mapValue: { fields: { nested: { booleanValue: false } } } },
      emptyArray: { arrayValue: {} },
      emptyMap: { mapValue: {} },
    });
    expect(request.writes[0].updateTransforms).toEqual([
      { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
      { fieldPath: '`field.with.dot`', setToServerValue: 'REQUEST_TIME' },
    ]);
  });

  it('maps transform timestamps to their explicit document paths and field names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      commitTime: '2026-08-19T01:02:03.123456Z',
      writeResults: [
        {
          transformResults: [
            { timestampValue: '2026-08-19T01:02:03.123457Z' },
            { timestampValue: '2026-08-19T01:02:03.123458Z' },
          ],
        },
        {
          transformResults: [
            { timestampValue: '2026-08-19T01:02:03.123459Z' },
          ],
        },
      ],
    }), { status: 200 }));

    await expect(commitFirestoreDocuments([
      {
        path: 'users/u/trips/t',
        fields: { count: 1 },
        serverTimestampFields: ['statsUpdatedAt', 'updatedAt'],
      },
      {
        path: 'sharedTrips/s',
        fields: { count: 1 },
        serverTimestampFields: ['statsUpdatedAt'],
      },
    ], {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
    })).resolves.toEqual({
      commitTime: '2026-08-19T01:02:03.123456Z',
      writes: [
        {
          path: 'users/u/trips/t',
          transformResults: {
            statsUpdatedAt: '2026-08-19T01:02:03.123457Z',
            updatedAt: '2026-08-19T01:02:03.123458Z',
          },
        },
        {
          path: 'sharedTrips/s',
          transformResults: {
            statsUpdatedAt: '2026-08-19T01:02:03.123459Z',
          },
        },
      ],
    });
  });

  it.each([
    [{ writeResults: [] }, 'incomplete write results'],
    [{
      writeResults: [{ transformResults: [{ timestampValue: 'not-a-timestamp' }] }],
    }, 'malformed transform timestamp'],
    [{
      writeResults: [{ transformResults: [] }],
    }, 'incomplete transform results'],
  ])('rejects %s instead of synthesizing an authoritative timestamp', async (body, message) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    await expect(commitFirestoreDocuments([{
      path: 'users/u/trips/t',
      fields: { count: 1 },
      serverTimestampFields: ['statsUpdatedAt'],
    }], {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
    })).rejects.toMatchObject({
      code: 'DATA_LOSS',
      message: expect.stringContaining(message),
    });
  });

  it('uses emulator admin auth and never requests a production token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const tokenFetch = vi.fn();
    await commitFirestoreDocuments([{
      path: 'users/u/trips/t',
      fields: { count: 1 },
    }], {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
      tokenFetch,
      serviceAccount: {},
    });

    expect(tokenFetch).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/v1/projects/demo-project/databases/(default)/documents:commit',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer owner' }),
      }),
    );
  });

  it('sends exists-true masked updates for deterministic derived fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await commitFirestoreDocuments([{
      path: 'users/u/trips/t',
      fields: { stats: { totalRides: 2 }, parkNames: { p: 'Park' } },
      operation: 'update',
      updateMaskFields: ['stats', 'parkNames'],
    }], {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const write = JSON.parse(String(init.body)).writes[0];
    expect(write.currentDocument).toEqual({ exists: true });
    expect(write.updateMask).toEqual({ fieldPaths: ['stats', 'parkNames'] });
  });

  it('runs an abortable equality query and decodes authoritative ride logs', async () => {
    const name = 'projects/demo-project/databases/(default)/documents/users/u/rideLogs/r1';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      document: {
        name,
        fields: {
          tripId: { stringValue: 'trip-1' },
          waitTimeMinutes: { integerValue: '25' },
        },
      },
    }, { readTime: '2026-08-19T00:00:00Z' }]), { status: 200 }));
    await expect(runFirestoreEqualityQuery({
      collectionPath: 'users/user%2F name/rideLogs',
      field: 'tripId',
      value: 'trip-1',
    }, {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
    })).resolves.toEqual({
      documents: [{
        path: 'users/u/rideLogs/r1',
        fields: { tripId: 'trip-1', waitTimeMinutes: 25 },
      }],
      readTime: '2026-08-19T00:00:00Z',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/documents/users/user%252F%20name:runQuery');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('encodes a bounded ordered cursor query for stable descending pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { readTime: '2026-08-19T00:00:00Z' },
    ]), { status: 200 }));
    await runFirestoreEqualityQuery({
      collectionPath: 'users/u/rideLogs',
      field: 'tripId',
      value: 'trip-1',
      projectionFields: ['attractionName', 'rodeAt'],
      orderBy: [
        { field: 'rodeAt', direction: 'DESCENDING' },
        { field: '__name__', direction: 'DESCENDING' },
      ],
      startAfter: {
        values: [new Timestamp(1_776_733_323, 123_456_789)],
        documentPath: 'users/u/rideLogs/ride-20',
      },
      pageSize: 21,
      limit: 21,
      maxDocuments: 21,
    }, {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const query = JSON.parse(String(init.body)).structuredQuery;
    expect(query).toMatchObject({
      select: { fields: [{ fieldPath: 'attractionName' }, { fieldPath: 'rodeAt' }] },
      orderBy: [
        { field: { fieldPath: 'rodeAt' }, direction: 'DESCENDING' },
        { field: { fieldPath: '__name__' }, direction: 'DESCENDING' },
      ],
      startAt: {
        values: [
          { timestampValue: '2026-04-21T01:02:03.123456789Z' },
          {
            referenceValue:
              'projects/demo-project/databases/(default)/documents/users/u/rideLogs/ride-20',
          },
        ],
        before: false,
      },
      limit: 21,
    });
  });

  it('physically aborts a never-settling ordered query with no orphan retry', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      observedSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    });
    const result = runFirestoreEqualityQuery({
      collectionPath: 'users/u/rideLogs',
      field: 'tripId',
      value: 'trip-1',
      orderBy: [
        { field: 'rodeAt', direction: 'DESCENDING' },
        { field: '__name__', direction: 'DESCENDING' },
      ],
      pageSize: 21,
      limit: 21,
    }, {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
      readAbortMs: 25,
      deadlineAt: Date.now() + 25,
    }).catch((error) => error);

    await vi.advanceTimersByTimeAsync(26);
    await expect(result).resolves.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    expect(observedSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('encodes URL path segments without changing literal resource names', () => {
    expect(encodeFirestoreUrlPath('users/user%2F id/旅行')).toBe(
      'users/user%252F%20id/%E6%97%85%E8%A1%8C',
    );
  });

  it('projects bounded fields and paginates at one snapshot without truncation', async () => {
    const prefix = 'projects/demo-project/databases/(default)/documents/users/u/rideLogs/';
    const response = (ids: string[]) => new Response(JSON.stringify([
      ...ids.map((id) => ({
        document: {
          name: `${prefix}${id}`,
          fields: {
            tripId: { stringValue: 'trip-1' },
            waitTimeMinutes: { integerValue: id.slice(1) },
          },
        },
        readTime: '2026-08-19T00:00:00.123456789Z',
      })),
      { readTime: '2026-08-19T00:00:00.123456789Z' },
    ]), { status: 200 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(['r1', 'r2']))
      .mockResolvedValueOnce(response(['r3']));
    const result = await runFirestoreEqualityQuery({
      collectionPath: 'users/u/rideLogs',
      field: 'tripId',
      value: 'trip-1',
      projectionFields: ['tripId', 'waitTimeMinutes'],
      pageSize: 2,
      transaction: 'transaction-token',
    }, {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
    });

    expect(result.documents).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(firstBody).toMatchObject({
      transaction: 'transaction-token',
      structuredQuery: {
        select: {
          fields: [{ fieldPath: 'tripId' }, { fieldPath: 'waitTimeMinutes' }],
        },
        limit: 2,
      },
    });
    expect(secondBody.structuredQuery.startAt).toEqual({
      values: [{ referenceValue: `${prefix}r2` }],
      before: false,
    });
  });

  it('streams decoded documents to a collector without retaining prior pages', async () => {
    const prefix = 'projects/demo-project/databases/(default)/documents/users/u/rideLogs/';
    const response = (id: string) => new Response(JSON.stringify([{
      document: {
        name: `${prefix}${id}`,
        fields: { tripId: { stringValue: 'trip-1' } },
      },
      readTime: '2026-08-19T00:00:00Z',
    }]), { status: 200 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response('r1'))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { readTime: '2026-08-19T00:00:00Z' },
      ]), { status: 200 }));
    const visited: string[] = [];

    const result = await runFirestoreEqualityQuery({
      collectionPath: 'users/u/rideLogs',
      field: 'tripId',
      value: 'trip-1',
      pageSize: 1,
      onDocument: (document) => visited.push(document.path),
    }, {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
    });

    expect(visited).toEqual(['users/u/rideLogs/r1']);
    expect(result.documents).toEqual([]);
  });

  it('enforces one total decoded-byte budget across query pages', async () => {
    const name = 'projects/demo-project/databases/(default)/documents/users/u/rideLogs/r1';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      document: {
        name,
        fields: { tripId: { stringValue: 'trip-1' } },
      },
    }]), { status: 200 }));

    await expect(runFirestoreEqualityQuery({
      collectionPath: 'users/u/rideLogs',
      field: 'tripId',
      value: 'trip-1',
      maxDecodedBytes: 32,
    }, {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
    })).rejects.toMatchObject({ code: 'RESOURCE_EXHAUSTED' });
  });

  it('enforces the conservative representation budget at the exact wire boundary', async () => {
    const name = 'projects/demo-project/databases/(default)/documents/users/u/rideLogs/r1';
    const body = JSON.stringify([{
      document: {
        name,
        fields: { tripId: { stringValue: 'trip-1' } },
      },
    }]);
    const representationBytes = Buffer.byteLength(body) * QUERY_REPRESENTATION_MULTIPLIER;
    const query = {
      collectionPath: 'users/u/rideLogs',
      field: 'tripId',
      value: 'trip-1',
    };
    const dependencies = {
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
    };

    await expect(runFirestoreEqualityQuery({
      ...query,
      maxRepresentationBytes: representationBytes,
    }, {
      ...dependencies,
      fetch: vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    })).resolves.toMatchObject({ documents: [{ path: 'users/u/rideLogs/r1' }] });
    await expect(runFirestoreEqualityQuery({
      ...query,
      maxRepresentationBytes: representationBytes - 1,
    }, {
      ...dependencies,
      fetch: vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    })).rejects.toMatchObject({ code: 'RESOURCE_EXHAUSTED' });
  });

  it('physically aborts the fetch deadline and performs no internal retry', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      observedSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });

      });
    });
    const result = commitFirestoreDocuments([{
      path: 'users/u/trips/t',
      fields: { count: 1 },
    }], {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
      commitAbortMs: 50,
    }).catch((error) => error);

    await vi.advanceTimersByTimeAsync(51);
    const error = await result;
    expect(error).toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    expect(observedSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('caps a commit to the remaining overall route budget', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      observedSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    });
    const result = commitFirestoreDocuments([{
      path: 'users/u/trips/t',
      fields: { count: 1 },
    }], {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
      commitAbortMs: 7_000,
      deadlineAt: Date.now() + 25,
    }).catch((error) => error);

    await vi.advanceTimersByTimeAsync(26);
    await expect(result).resolves.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    expect(observedSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts an unreadable Firestore error body within the same request deadline', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      observedSignal = init?.signal as AbortSignal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          observedSignal?.addEventListener('abort', () => {
            controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        },
      });
      return Promise.resolve(new Response(body, { status: 409 }));
    });
    const result = commitFirestoreDocuments([{
      path: 'users/u/trips/t',
      fields: { count: 1 },
    }], {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
      commitAbortMs: 50,
    }).catch((error) => error);

    await vi.advanceTimersByTimeAsync(51);
    await expect(result).resolves.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    expect(observedSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('maps canonical REST errors defensively without retrying', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 409, status: 'ALREADY_EXISTS', message: 'private path detail' },
      }), { status: 409 }))
      .mockResolvedValueOnce(new Response('not json', { status: 503 }));
    const dependencies = {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
    };

    await expect(commitFirestoreDocuments([{
      path: 'users/u/trips/t',
      fields: { count: 1 },
    }], dependencies)).rejects.toMatchObject({
      code: 'ALREADY_EXISTS',
      httpStatus: 409,
      message: 'Firestore REST commit failed.',
    });
    await expect(commitFirestoreDocuments([{
      path: 'users/u/trips/t2',
      fields: { count: 2 },
    }], dependencies)).rejects.toMatchObject({ code: 'UNAVAILABLE', httpStatus: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, 'UNAUTHENTICATED'],
    [403, 'PERMISSION_DENIED'],
    [429, 'RESOURCE_EXHAUSTED'],
    [504, 'DEADLINE_EXCEEDED'],
  ])('maps HTTP %i to %s when the body is unusable', async (status, code) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('x'.repeat(20_000), { status }));
    await expect(commitFirestoreDocuments([{
      path: 'users/u/trips/t',
      fields: { count: 1 },
    }], {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
    })).rejects.toMatchObject({ code, httpStatus: status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves a canonical ABORTED response instead of treating every 409 as replayable', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 409, status: 'ABORTED' },
    }), { status: 409 }));
    await expect(commitFirestoreDocuments([{
      path: 'users/u/trips/t',
      fields: { count: 1 },
    }], {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
    })).rejects.toMatchObject({ code: 'ABORTED', httpStatus: 409 });
  });

  it.each([
    [null, 'bodyless'],
    ['not json', 'malformed'],
    [JSON.stringify({ error: { code: 409 } }), 'missing canonical status'],
    [JSON.stringify({ error: { status: 'already_exists' } }), 'noncanonical status'],
  ])('keeps %s 409 responses ambiguous', async (body) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 409 }));
    await expect(commitFirestoreDocuments([{
      path: 'users/u/trips/t',
      fields: { count: 1 },
    }], {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
    })).rejects.toMatchObject({ code: 'HTTP_409', httpStatus: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates a canonical JWT bearer request without exposing key material', async () => {
    const serviceAccount = testServiceAccount();
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse());
    const now = 1_777_000_000_000;
    const getAccessToken = createServiceAccountAccessTokenProvider(serviceAccount, {
      fetch: fetchMock,
      now: () => now,
    });

    await expect(getAccessToken()).resolves.toBe('test-access-token');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const form = init.body as URLSearchParams;
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const assertion = String(form.get('assertion'));
    const [encodedHeader, encodedClaims, signature] = assertion.split('.');
    expect(JSON.parse(Buffer.from(encodedHeader, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(encodedClaims, 'base64url').toString())).toEqual({
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/datastore',
      iat: Math.floor(now / 1_000),
      exp: Math.floor(now / 1_000) + 3_600,
    });
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(assertion).not.toContain(String(serviceAccount.private_key));
  });

  it('caches unexpired tokens, refreshes with expiry skew, and deduplicates acquisition', async () => {
    let now = 1_777_000_000_000;
    let resolveFirst!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce(tokenResponse('refreshed-token'));
    const getAccessToken = createServiceAccountAccessTokenProvider(testServiceAccount(), {
      fetch: fetchMock,
      now: () => now,
    });

    const first = getAccessToken();
    const concurrent = getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst(tokenResponse('cached-token', 120));
    await expect(Promise.all([first, concurrent])).resolves.toEqual([
      'cached-token',
      'cached-token',
    ]);
    await expect(getAccessToken()).resolves.toBe('cached-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 61_000;
    await expect(getAccessToken()).resolves.toBe('refreshed-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('physically aborts production token fetch before starting Firestore fetch', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const tokenFetch = vi.fn((_url: string, init?: RequestInit) => {
      observedSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    });
    const firestoreFetch = vi.fn();
    const result = commitFirestoreDocuments([{
      path: 'users/u/trips/t',
      fields: { count: 1 },
    }], {
      fetch: firestoreFetch,
      tokenFetch,
      serviceAccount: testServiceAccount(),
      projectId: 'demo-project',
      emulatorHost: null,
      accessTokenDeadlineMs: 25,
    }).catch((error) => error);

    await vi.advanceTimersByTimeAsync(26);
    await expect(result).resolves.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    expect(observedSignal?.aborted).toBe(true);
    expect(tokenFetch).toHaveBeenCalledTimes(1);
    expect(firestoreFetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [new Response('not json', { status: 200 }), 'malformed JSON'],
    [new Response(JSON.stringify({ access_token: 42, expires_in: '3600' }), {
      status: 200,
    }), 'invalid schema'],
    [new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }), 'OAuth 400'],
    [new Response(JSON.stringify({ error: 'unauthorized_client' }), { status: 401 }), 'OAuth 401'],
  ])('classifies permanent token-stage %s as configuration failure', async (response) => {
    const provider = createServiceAccountAccessTokenProvider(testServiceAccount(), {
      fetch: vi.fn().mockResolvedValue(response),
    });
    await expect(provider()).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });
  });

  it('batchGets literal document names and decodes found and missing entries', async () => {
    const projectId = 'demo-project';
    const foundPath = 'users/user name/trips/trip%id';
    const missingPath = 'sharedTrips/share-id';
    const foundName = `projects/${projectId}/databases/(default)/documents/${foundPath}`;
    const missingName = `projects/${projectId}/databases/(default)/documents/${missingPath}`;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { missing: missingName, readTime: '2026-08-19T00:00:00Z' },
      {
        found: {
          name: foundName,
          fields: {
            fingerprint: { stringValue: 'abc' },
            nested: {
              mapValue: {
                fields: {
                  userId: { stringValue: 'user-123' },
                  tripId: { nullValue: null },
                },
              },
            },
            values: {
              arrayValue: {
                values: [{ integerValue: '2' }, { booleanValue: true }],
              },
            },
          },
        },
        readTime: '2026-08-19T00:00:00Z',
      },
    ]), { status: 200 }));

    const result = await batchGetFirestoreDocuments([foundPath, missingPath], {
      fetch: fetchMock,
      projectId,
      emulatorHost: '127.0.0.1:8080',
    });

    expect(result.get(missingPath)).toBeNull();
    expect(result.get(foundPath)).toEqual({
      path: foundPath,
      fields: {
        fingerprint: 'abc',
        nested: { userId: 'user-123', tripId: null },
        values: [2, true],
      },
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      documents: [foundName, missingName],
    });
  });

  it('physically aborts a never-settling classification read without retrying', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      observedSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    });
    const result = batchGetFirestoreDocuments(['users/u/trips/trip-id'], {
      fetch: fetchMock,
      projectId: 'demo-project',
      emulatorHost: '127.0.0.1:8080',
      readAbortMs: 25,
    }).catch((error) => error);

    await vi.advanceTimersByTimeAsync(26);
    await expect(result).resolves.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    expect(observedSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [undefined, 'missing'],
    ['', 'empty'],
    ['bad/project', 'slash'],
    ['UPPERCASE', 'uppercase'],
  ])('rejects %s project IDs before transport', async (projectId) => {
    const fetchMock = vi.fn();
    await expect(commitFirestoreDocuments([{
      path: 'users/u/trips/trip-id',
      fields: { count: 1 },
    }], {
      fetch: fetchMock,
      projectId,
      emulatorHost: '127.0.0.1:8080',
    })).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{}, 'missing credentials'],
    [{ ...testServiceAccount(), project_id: undefined }, 'missing project ID'],
    [{ ...testServiceAccount(), project_id: 'bad/project' }, 'malformed project ID'],
    [{ ...testServiceAccount(), client_email: 'not-an-email' }, 'malformed email'],
    [{ ...testServiceAccount(), private_key: 'not-pkcs8' }, 'malformed private key'],
    [{ ...testServiceAccount(), token_uri: undefined }, 'missing token URI'],
    [{ ...testServiceAccount(), token_uri: 'http://metadata.invalid/token' }, 'HTTP token URI'],
    [{ ...testServiceAccount(), token_uri: 'https://example.invalid/token' }, 'custom token URI'],
  ])('rejects invalid credentials during provider construction: %s', (serviceAccount) => {
    expect(() => createServiceAccountAccessTokenProvider(serviceAccount))
      .toThrow(expect.objectContaining({ code: 'FAILED_PRECONDITION' }));
  });

  it('allows an explicit non-production custom token endpoint seam', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse());
    const serviceAccount = {
      ...testServiceAccount(),
      token_uri: 'https://oauth.test.invalid/token',
    };
    const provider = createServiceAccountAccessTokenProvider(serviceAccount, {
      fetch: fetchMock,
      allowCustomTokenUri: true,
    });
    await expect(provider()).resolves.toBe('test-access-token');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth.test.invalid/token',
      expect.any(Object),
    );
    vi.unstubAllEnvs();
  });

  it('physically aborts an unreadable OAuth response body', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const tokenFetch = vi.fn((_url: string, init?: RequestInit) => {
      observedSignal = init?.signal as AbortSignal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          observedSignal.addEventListener('abort', () => {
            controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    const getAccessToken = createServiceAccountAccessTokenProvider(testServiceAccount(), {
      fetch: tokenFetch,
      deadlineMs: 25,
    });
    const result = getAccessToken().catch((error) => error);

    await vi.advanceTimersByTimeAsync(26);
    await expect(result).resolves.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    expect(observedSignal?.aborted).toBe(true);
    expect(tokenFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects unsupported values before fetch', async () => {
    expect(() => encodeFirestoreRestValue(undefined)).toThrow(FirestoreRestCommitError);
  });
});
