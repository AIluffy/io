type StructuredCloneFn = typeof structuredClone;

export function runWithDeepCloneCounter<T>(
  run: () => T,
): { result: T; deepCloneCount: number } {
  const maybeStructuredClone = (globalThis as Record<PropertyKey, unknown>)
    .structuredClone;
  if (typeof maybeStructuredClone !== 'function') {
    return { result: run(), deepCloneCount: 0 };
  }

  const originalStructuredClone = maybeStructuredClone as StructuredCloneFn;
  let deepCloneCount = 0;
  const countingStructuredClone: StructuredCloneFn = ((...args: Parameters<
    StructuredCloneFn
  >) => {
    deepCloneCount += 1;
    return originalStructuredClone(...args);
  }) as StructuredCloneFn;

  (globalThis as { structuredClone: StructuredCloneFn }).structuredClone =
    countingStructuredClone;
  try {
    return { result: run(), deepCloneCount };
  } finally {
    (globalThis as { structuredClone: StructuredCloneFn }).structuredClone =
      originalStructuredClone;
  }
}
