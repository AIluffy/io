export type IoViewExtensions = Record<string, unknown>;

export type IoView<T> = {
  get(): T;
  set?(next: T | ((prev: T) => T)): void;
  subscribe(fn: (v: T) => void): () => void;
  snapshot?(): T;
  extensions?: IoViewExtensions;
  destroy?(): void;
};

export type IoCallableView<T> = IoView<T> & {
  (): T;
  (next: T | ((prev: T) => T)): void;
};

export type IoBehavior<T> = (view: IoView<T>) => IoView<T>;
