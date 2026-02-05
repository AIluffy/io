type IoGlobal = {
  window?: unknown;
  document?: unknown;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const ioGlobal = globalThis as unknown as IoGlobal;
ioGlobal.window ??= {};
ioGlobal.document ??= {};
ioGlobal.IS_REACT_ACT_ENVIRONMENT = true;

