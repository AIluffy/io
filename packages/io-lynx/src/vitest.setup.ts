type IoGlobal = {
  window?: unknown;
  document?: unknown;
};

const ioGlobal = globalThis as unknown as IoGlobal;
ioGlobal.window ??= {};
ioGlobal.document ??= {};
