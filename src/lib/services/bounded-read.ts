export const CATALOG_READ_TIMEOUT_MS = 8_000;

export class BoundedReadError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'BoundedReadError';
  }
}

export function withReadDeadline<T>(
  promise: Promise<T>,
  message: string,
  timeoutMs = CATALOG_READ_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BoundedReadError(message)), timeoutMs);
  });
  return Promise.race([promise, deadline])
    .catch((error) => {
      if (error instanceof BoundedReadError) throw error;
      throw new BoundedReadError(message, error);
    })
    .finally(() => {
      if (timer) clearTimeout(timer);
    });
}
