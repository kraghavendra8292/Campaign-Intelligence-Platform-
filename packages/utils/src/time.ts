/** Measures the duration of an async operation without swallowing its error. */
export async function measure<T>(
  operation: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const startedAt = performance.now();
  const result = await operation();
  return { result, durationMs: Math.round(performance.now() - startedAt) };
}

/** Rejects if the supplied promise does not settle within `timeoutMs`. */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
