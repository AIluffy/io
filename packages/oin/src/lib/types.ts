export type OinUnsubscribe = () => void;

export type OinPath = ReadonlyArray<string | number>;

export type OinPatch =
  | {
      op: 'set';
      path: OinPath;
      prev: unknown;
      next: unknown;
    }
  | {
      op: 'splice';
      path: OinPath;
      start: number;
      deleteCount: number;
      deleted: unknown[];
      items: unknown[];
    }
  | {
      op: 'sort';
      path: OinPath;
      order: number[];
    };

export type OinUpdate = {
  id: string;
  baseRevision: number;
  revision: number;
  patches: OinPatch[];
};

export type OinUnit<T> = {
  (): T;
  (next: T | ((prev: T) => T)): void;
  snapshot(): T;
  subscribe(fn: (v: T) => void): OinUnsubscribe;
  subscribeUpdate(fn: (u: OinUpdate) => void): OinUnsubscribe;
  reset(): void;
};

export type OinDerived<T> = {
  (): T;
  snapshot(): T;
  subscribe(fn: (v: T) => void): OinUnsubscribe;
};

export type OinArrayUnit<T> = {
  (): T[];
  [i: number]: OinUnit<T>;
  push(...items: T[]): void;
  pop(): T | undefined;
  splice(start: number, deleteCount: number, ...items: T[]): void;
  sort(compareFn?: (a: T, b: T) => number): void;
  commit(fn: (draft: T[]) => void): void;
  reduce<R>(
    reducer: (acc: R, item: OinUnit<T>, index: number) => R,
    initialValue: R
  ): R;
  [Symbol.iterator](): Iterator<OinUnit<T>>;
  snapshot(): T[];
  subscribe(fn: (v: T[]) => void): OinUnsubscribe;
  subscribeUpdate(fn: (u: OinUpdate) => void): OinUnsubscribe;
};

export type OinScope<T extends Record<string, unknown>> = {
  [K in keyof T]: OinUnit<T[K]>;
} & {
  commit(fn: (draft: T) => void): void;
  snapshot(): T;
  subscribe(fn: (v: T) => void): OinUnsubscribe;
  subscribeUpdate(fn: (u: OinUpdate) => void): OinUnsubscribe;
};

export type OinNode<T> = T extends readonly (infer U)[]
  ? OinArrayUnit<U>
  : T extends Record<string, unknown>
  ? OinScope<T>
  : OinUnit<T>;

export type OinTreeNode<T> = T extends readonly (infer U)[]
  ? OinTreeArrayUnit<U>
  : T extends Record<string, unknown>
  ? OinTreeScope<T>
  : OinUnit<T>;

export type OinTreeArrayUnit<T> = {
  (): T[];
  [i: number]: OinTreeNode<T>;
  push(...items: T[]): void;
  pop(): T | undefined;
  splice(start: number, deleteCount: number, ...items: T[]): void;
  sort(compareFn?: (a: T, b: T) => number): void;
  commit(fn: (draft: T[]) => void): void;
  snapshot(): T[];
  subscribe(fn: (v: T[]) => void): OinUnsubscribe;
  subscribeUpdate(fn: (u: OinUpdate) => void): OinUnsubscribe;
};

export type OinTreeScope<T extends Record<string, unknown>> = {
  [K in keyof T]: OinTreeNode<T[K]>;
} & {
  commit(fn: (draft: T) => void): void;
  snapshot(): T;
  subscribe(fn: (v: T) => void): OinUnsubscribe;
  subscribeUpdate(fn: (u: OinUpdate) => void): OinUnsubscribe;
};
