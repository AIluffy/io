type OinGlobal = {
  window?: unknown;
  document?: unknown;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const oinGlobal = globalThis as unknown as OinGlobal;
oinGlobal.window ??= {};
oinGlobal.document ??= {};
oinGlobal.IS_REACT_ACT_ENVIRONMENT = true;

