export type OinViewExtensions = Record<string, unknown>;

export type OinView<T> = {
  get(): T;
  set?(next: T | ((prev: T) => T)): void;
  subscribe(fn: (v: T) => void): () => void;
  snapshot?(): T;
  extensions?: OinViewExtensions;
  destroy?(): void;
};

export type OinCallableView<T> = OinView<T> & {
  (): T;
  (next: T | ((prev: T) => T)): void;
};

export type OinBehavior<T> = (view: OinView<T>) => OinView<T>;
