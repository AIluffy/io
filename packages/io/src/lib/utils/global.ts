type IoGlobal = {
  window?: unknown;
  document?: unknown;
  requestAnimationFrame?: (cb: () => void) => number;
};

export const ioGlobal: IoGlobal | undefined =
  typeof globalThis === 'undefined'
    ? undefined
    : (globalThis as IoGlobal);
