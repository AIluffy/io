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

export type IoUpdateMeta = Readonly<Record<string, unknown>>;

export type IoUpdateAnnotation = {
  action?: string;
  meta?: IoUpdateMeta;
};

export type IoUpdate = {
  id: string;
  baseRevision: number;
  revision: number;
  patches: IoPatch[];
  action?: string;
  meta?: IoUpdateMeta;
};

export type IoHistoryOptions = {
  limit?: number;
  emitUpdate?: boolean;
  filter?: IoHistoryFilterStrategy;
  groupBy?: (update: IoUpdate) => PropertyKey | undefined;
};

export type IoHistoryFilterStrategy =
  | 'all'
  | 'exclude-undo-redo'
  | ((update: IoUpdate) => boolean);

export type IoHistory = {
  undo(): void;
  undoGroup(): void;
  redo(): void;
  redoGroup(): void;
  checkpoint(): void;
  clear(): void;
  destroy(): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly length: number;
  readonly cursor: number;
};

export type IoUnit<T> = {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
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

declare const IO_LINK: unique symbol;
export type IoLink<T> = {
  readonly [IO_LINK]: T;
};

export type IoTreeNode<T, MaxDepth extends number = 16> =
  [T] extends [IoLink<infer U>]
    ? U
    : MaxDepth extends 0
      ? IoUnit<T>
      : [T] extends [readonly (infer U)[]]
        ? IoTreeArrayUnit<U, PrevDepth<MaxDepth>>
        : [T] extends [Record<string, unknown>]
          ? IoTreeScope<T, PrevDepth<MaxDepth>>
          : IoUnit<T>;

export type IoNode<T> = [T] extends [IoLink<infer U>]
  ? U
  : [T] extends [readonly (infer U)[]]
    ? IoArrayUnit<U>
    : [T] extends [Record<string, unknown>]
      ? IoScope<T>
      : IoUnit<T>;

export type IoResult<T, MaxDepth extends number = 16> = IoTreeNode<T, MaxDepth>;

export type IoTreeArrayUnit<T, MaxDepth extends number = 8> = {
  get(): UnwrapIo<T>[];
  [i: number]: IoTreeNode<T, MaxDepth>;
  set(next: UnwrapIo<T>[]): void;
  push(...items: UnwrapIo<T>[]): void;
  pop(): UnwrapIo<T> | undefined;
  splice(
    start: number,
    deleteCount: number,
    ...items: UnwrapIo<T>[]
  ): void;
  sort(
    compareFn?: (
      a: UnwrapIo<T>,
      b: UnwrapIo<T>
    ) => number
  ): void;
  commit(fn: (draft: UnwrapIo<T>[]) => void): void;
  reduce<R>(
    reducer: (acc: R, item: IoTreeNode<T, MaxDepth>, index: number) => R,
    initialValue: R,
  ): R;
  [Symbol.iterator](): Iterator<IoTreeNode<T, MaxDepth>>;
  snapshot(): UnwrapIo<T>[];
  subscribe(fn: (v: UnwrapIo<T>[]) => void): IoUnsubscribe;
  subscribeUpdate(fn: (u: IoUpdate) => void): IoUnsubscribe;
};

export type IoArrayUnit<T> = IoTreeArrayUnit<T, 1>;

export type IoTreeScope<
  T extends Record<string, unknown>,
  MaxDepth extends number = 8,
> = {
  [K in keyof T]: IoTreeNode<T[K], MaxDepth>;
} & {
  get(): UnwrapIo<T>;
  commit(fn: (draft: UnwrapIo<T>) => void): void;
  snapshot(): UnwrapIo<T>;
  subscribe(
    fn: (v: UnwrapIo<T>) => void
  ): IoUnsubscribe;
  subscribeUpdate(fn: (u: IoUpdate) => void): IoUnsubscribe;
};

export type IoScope<T extends Record<string, unknown>> = IoTreeScope<T, 1>;

export type IoTypeInferenceMode = 'unknown' | 'error';

type BuildTuple<
  N extends number,
  T extends unknown[] = [],
> = number extends N
  ? never
  : T['length'] extends N
    ? T
    : BuildTuple<N, [...T, unknown]>;

type Subtract1<N extends number> = number extends N
  ? number
  : BuildTuple<N> extends [unknown, ...infer Rest]
    ? Rest['length']
    : 0;

type PrevDepth<N extends number> = Subtract1<N>;

type IoTypeError<Message extends string> = {
  readonly __oin_type_inference_error__: Message;
};

type TypeFailure<
  Message extends string,
  Mode extends IoTypeInferenceMode,
> = Mode extends 'error' ? never & IoTypeError<Message> : unknown;

type LinkValue<T> = T extends { get(): infer V } ? V : unknown;
type NormalizeIoInput<T> = [T] extends [IoLink<infer U>]
  ? LinkValue<U>
  : [T] extends [{ get(): unknown }]
    ? LinkValue<T>
    : T;

type IsRecord<T> = [NormalizeIoInput<T>] extends [Record<string, unknown>]
  ? true
  : false;
type IsArray<T> = [NormalizeIoInput<T>] extends [readonly unknown[]]
  ? true
  : false;

export type UnwrapIo<
  T,
  MaxDepth extends number = 16,
  Mode extends IoTypeInferenceMode = 'unknown',
> = MaxDepth extends 0
  ? TypeFailure<'UnwrapIo: exceeded MaxDepth', Mode>
  : IsArray<T> extends true
    ? NormalizeIoInput<T> extends readonly (infer U)[]
      ? UnwrapIo<U, PrevDepth<MaxDepth>, Mode>[]
      : never
    : IsRecord<T> extends true
      ? {
          [K in keyof NormalizeIoInput<T>]: UnwrapIo<
            NormalizeIoInput<T>[K],
            PrevDepth<MaxDepth>,
            Mode
          >;
        }
      : NormalizeIoInput<T>;

type PathSegment = PropertyKey;

type PathOfImpl<T, Depth extends number> = Depth extends 0
  ? never
  : [NormalizeIoInput<T>] extends [readonly (infer U)[]]
    ? [number] | [number, ...PathOfImpl<U, PrevDepth<Depth>>]
    : [NormalizeIoInput<T>] extends [Record<string, unknown>]
      ? {
          [K in Extract<keyof NormalizeIoInput<T>, string>]:
            | [K]
            | [K, ...PathOfImpl<NormalizeIoInput<T>[K], PrevDepth<Depth>>];
        }[Extract<keyof NormalizeIoInput<T>, string>]
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
    ? NormalizeIoInput<T>
    : MaxDepth extends 0
      ? TypeFailure<'IoPathValue: exceeded MaxDepth', Mode>
      : P[0] extends number
        ? NormalizeIoInput<T> extends readonly (infer U)[]
          ? IoPathValue<U, Tail<P>, PrevDepth<MaxDepth>, Mode>
          : TypeFailure<'IoPathValue: invalid array path', Mode>
        : P[0] extends keyof NormalizeIoInput<T>
          ? IoPathValue<
              NormalizeIoInput<T>[P[0]],
              Tail<P>,
              PrevDepth<MaxDepth>,
              Mode
            >
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
