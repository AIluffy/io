export function defineLazyValue(
  target: object,
  key: PropertyKey,
  compute: () => unknown,
): void {
  let resolved = false;
  let cached: unknown;
  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: true,
    get: () => {
      if (!resolved) {
        cached = compute();
        resolved = true;
      }
      return cached;
    },
  });
}

export function materializeKeys(target: Record<PropertyKey, unknown>): void {
  for (const key of Reflect.ownKeys(target)) {
    void target[key];
  }
}
