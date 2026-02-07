export type IoUnsubscribe = () => void;

export type Primitive =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;

export type IoPath = ReadonlyArray<PropertyKey>;

export type IoPatch =
  | {
      op: 'set';
      path: IoPath;
      prev: unknown;
      next: unknown;
    }
  | {
      op: 'splice';
      path: IoPath;
      start: number;
      deleteCount: number;
      deleted: unknown[];
      items: unknown[];
    }
  | {
      op: 'sort';
      path: IoPath;
      order: number[];
    };

export type IoUpdate = {
  id: string;
  baseRevision: number;
  revision: number;
  patches: IoPatch[];
};

export type IoUnit<T> = {
  get(): T;
  set(next: T): void;
  update(fn: (prev: T) => T): void;
  snapshot(): T;
  subscribe(fn: (v: T) => void): IoUnsubscribe;
  subscribeUpdate(fn: (u: IoUpdate) => void): IoUnsubscribe;
  reset(): void;
};

export type IoDerived<T> = {
  get(): T;
  snapshot(): T;
  subscribe(fn: (v: T) => void): IoUnsubscribe;
};

export type IoNode<T> = [T] extends [readonly (infer U)[]]
  ? IoArrayUnit<U>
  : [T] extends [Record<string, unknown>]
    ? IoScope<T>
    : IoUnit<T>;

export type IoTreeNode<T, MaxDepth extends number = 16> = MaxDepth extends 0
  ? IoUnit<T>
  : [T] extends [readonly (infer U)[]]
    ? IoTreeArrayUnit<U, PrevDepth<MaxDepth>>
    : [T] extends [Record<string, unknown>]
      ? IoTreeScope<T, PrevDepth<MaxDepth>>
      : IoUnit<T>;

export type IoResult<T, MaxDepth extends number = 16> = IoTreeNode<T, MaxDepth>;

export type IoTreeArrayUnit<T, MaxDepth extends number = 8> = {
  get(): T[];
  [i: number]: IoTreeNode<T, MaxDepth>;
  push(...items: T[]): void;
  pop(): T | undefined;
  splice(start: number, deleteCount: number, ...items: T[]): void;
  sort(compareFn?: (a: T, b: T) => number): void;
  commit(fn: (draft: T[]) => void): void;
  reduce<R>(
    reducer: (acc: R, item: IoTreeNode<T, MaxDepth>, index: number) => R,
    initialValue: R,
  ): R;
  [Symbol.iterator](): Iterator<IoTreeNode<T, MaxDepth>>;
  snapshot(): T[];
  subscribe(fn: (v: T[]) => void): IoUnsubscribe;
  subscribeUpdate(fn: (u: IoUpdate) => void): IoUnsubscribe;
};

export type IoArrayUnit<T> = IoTreeArrayUnit<T, 1>;

export type IoTreeScope<
  T extends Record<string, unknown>,
  MaxDepth extends number = 8,
> = {
  [K in keyof T]: IoTreeNode<T[K], MaxDepth>;
} & {
  get(): T;
  commit(fn: (draft: T) => void): void;
  snapshot(): T;
  subscribe(fn: (v: T) => void): IoUnsubscribe;
  subscribeUpdate(fn: (u: IoUpdate) => void): IoUnsubscribe;
};

export type IoScope<T extends Record<string, unknown>> = IoTreeScope<T, 1>;

export type IoTypeInferenceMode = 'unknown' | 'error';

type DepthTable = [
  0,
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  54,
  55,
  56,
  57,
  58,
  59,
  60,
  61,
  62,
  63,
  64,
];
type PrevDepth<N extends number> = DepthTable[N] extends number
  ? DepthTable[N]
  : 0;

type IoTypeError<Message extends string> = {
  readonly __oin_type_inference_error__: Message;
};

type TypeFailure<
  Message extends string,
  Mode extends IoTypeInferenceMode,
> = Mode extends 'error' ? never & IoTypeError<Message> : unknown;

type IsRecord<T> = [T] extends [Record<string, unknown>] ? true : false;
type IsArray<T> = [T] extends [readonly unknown[]] ? true : false;

export type UnwrapIo<
  T,
  MaxDepth extends number = 16,
  Mode extends IoTypeInferenceMode = 'unknown',
> = MaxDepth extends 0
  ? TypeFailure<'UnwrapIo: exceeded MaxDepth', Mode>
  : IsArray<T> extends true
    ? T extends readonly (infer U)[]
      ? UnwrapIo<U, PrevDepth<MaxDepth>, Mode>[]
      : never
    : IsRecord<T> extends true
      ? { [K in keyof T]: UnwrapIo<T[K], PrevDepth<MaxDepth>, Mode> }
      : T;

type PathSegment = PropertyKey;

type PathOfImpl<T, Depth extends number> = Depth extends 0
  ? never
  : [T] extends [readonly (infer U)[]]
    ? [number] | [number, ...PathOfImpl<U, PrevDepth<Depth>>]
    : [T] extends [Record<string, unknown>]
      ? {
          [K in Extract<keyof T, string>]:
            | [K]
            | [K, ...PathOfImpl<T[K], PrevDepth<Depth>>];
        }[Extract<keyof T, string>]
      : never;

export type IoPathOf<T, MaxDepth extends number = 5> =
  | []
  | PathOfImpl<T, MaxDepth>;

export type Path<T, MaxDepth extends number = 5> = IoPathOf<T, MaxDepth>;

type Tail<T extends readonly unknown[]> = T extends readonly [
  unknown,
  ...infer R,
]
  ? R
  : [];

export type IoPathValue<
  T,
  P extends ReadonlyArray<PathSegment>,
  MaxDepth extends number = 5,
  Mode extends IoTypeInferenceMode = 'unknown',
> = T extends unknown
  ? P extends []
    ? T
    : MaxDepth extends 0
      ? TypeFailure<'IoPathValue: exceeded MaxDepth', Mode>
      : P[0] extends number
        ? T extends readonly (infer U)[]
          ? IoPathValue<U, Tail<P>, PrevDepth<MaxDepth>, Mode>
          : TypeFailure<'IoPathValue: invalid array path', Mode>
        : P[0] extends keyof T
          ? IoPathValue<T[P[0]], Tail<P>, PrevDepth<MaxDepth>, Mode>
          : TypeFailure<'IoPathValue: invalid object path', Mode>
  : never;

export type IoErrorHandlerFor<T, MaxDepth extends number = 5> = (
  error: unknown,
  path: IoPathOf<T, MaxDepth>,
  operation: IoMutationOp,
) => void;

export type IoMutationOp =
  | 'set'
  | 'reset'
  | 'commit'
  | 'push'
  | 'pop'
  | 'splice'
  | 'sort'
  | 'applyUpdate';

export type IoErrorHandler = (
  error: unknown,
  path: IoPath,
  operation: IoMutationOp,
) => void;
