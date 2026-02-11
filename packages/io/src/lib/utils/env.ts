type IoGlobal = {
  window?: unknown;
  document?: unknown;
};

const ioGlobal: IoGlobal | undefined =
  typeof globalThis === 'undefined'
    ? undefined
    : (globalThis as unknown as IoGlobal);

export const isServerEnv = !ioGlobal?.window && !ioGlobal?.document;
