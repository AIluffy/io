type OinGlobal = {
  window?: unknown;
  document?: unknown;
};

const oinGlobal: OinGlobal | undefined =
  typeof globalThis === 'undefined'
    ? undefined
    : (globalThis as unknown as OinGlobal);

export const isServerEnv = !oinGlobal?.window && !oinGlobal?.document;
