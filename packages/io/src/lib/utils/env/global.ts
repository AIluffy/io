type IoGlobal = {
  window?: unknown;
  document?: unknown;
  requestAnimationFrame?: (cb: () => void) => number;
};

export const ioGlobal: IoGlobal = globalThis as IoGlobal;
