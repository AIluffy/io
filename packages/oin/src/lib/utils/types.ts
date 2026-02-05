export type OinUnsubscribe = () => void;

export type Primitive =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;

export type OinPath = ReadonlyArray<PropertyKey>;

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

export type OinNode<T> = T extends readonly (infer U)[]
  ? OinArrayUnit<U>
  : T extends Record<string, unknown>
  ? OinScope<T>
  : OinUnit<T>;

export type OinTreeNode<T, MaxDepth extends number = 16> = MaxDepth extends 0
  ? OinUnit<T>
  : T extends readonly (infer U)[]
  ? OinTreeArrayUnit<U, PrevDepth<MaxDepth>>
  : T extends Record<string, unknown>
  ? OinTreeScope<T, PrevDepth<MaxDepth>>
  : OinUnit<T>;

export type OinResult<T, MaxDepth extends number = 16> = OinTreeNode<T, MaxDepth>;

export type OinTreeArrayUnit<T, MaxDepth extends number = 8> = {
  (): T[];
  [i: number]: OinTreeNode<T, MaxDepth>;
  push(...items: T[]): void;
  pop(): T | undefined;
  splice(start: number, deleteCount: number, ...items: T[]): void;
  sort(compareFn?: (a: T, b: T) => number): void;
  commit(fn: (draft: T[]) => void): void;
  reduce<R>(
    reducer: (acc: R, item: OinTreeNode<T, MaxDepth>, index: number) => R,
    initialValue: R
  ): R;
  [Symbol.iterator](): Iterator<OinTreeNode<T, MaxDepth>>;
  snapshot(): T[];
  subscribe(fn: (v: T[]) => void): OinUnsubscribe;
  subscribeUpdate(fn: (u: OinUpdate) => void): OinUnsubscribe;
};

export type OinArrayUnit<T> = OinTreeArrayUnit<T, 1>;

export type OinTreeScope<
  T extends Record<string, unknown>,
  MaxDepth extends number = 8
> = {
  [K in keyof T]: OinTreeNode<T[K], MaxDepth>;
} & {
  commit(fn: (draft: T) => void): void;
  snapshot(): T;
  subscribe(fn: (v: T) => void): OinUnsubscribe;
  subscribeUpdate(fn: (u: OinUpdate) => void): OinUnsubscribe;
};

export type OinScope<T extends Record<string, unknown>> = OinTreeScope<T, 1>;

export type OinTypeInferenceMode = 'unknown' | 'error';

type DepthTable = [
  0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
  19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
  55, 56, 57, 58, 59, 60, 61, 62, 63, 64,
];
type PrevDepth<N extends number> = DepthTable[N] extends number ? DepthTable[N] : 0;

type OinTypeError<Message extends string> = {
  readonly __oin_type_inference_error__: Message;
};

type TypeFailure<
  Message extends string,
  Mode extends OinTypeInferenceMode
> = Mode extends 'error' ? never & OinTypeError<Message> : unknown;

type IsRecord<T> = [T] extends [Record<string, unknown>] ? true : false;
type IsArray<T> = [T] extends [readonly unknown[]] ? true : false;

export type UnwrapOin<
  T,
  MaxDepth extends number = 16,
  Mode extends OinTypeInferenceMode = 'unknown'
> = MaxDepth extends 0
  ? TypeFailure<'UnwrapOin: exceeded MaxDepth', Mode>
  : IsArray<T> extends true
  ? T extends readonly (infer U)[]
    ? UnwrapOin<U, PrevDepth<MaxDepth>, Mode>[]
    : never
  : IsRecord<T> extends true
  ? { [K in keyof T]: UnwrapOin<T[K], PrevDepth<MaxDepth>, Mode> }
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

export type OinPathOf<T, MaxDepth extends number = 5> =
  | []
  | PathOfImpl<T, MaxDepth>;

export type Path<T, MaxDepth extends number = 5> = OinPathOf<T, MaxDepth>;

type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer R]
  ? R
  : [];

export type OinPathValue<
  T,
  P extends ReadonlyArray<PathSegment>,
  MaxDepth extends number = 5,
  Mode extends OinTypeInferenceMode = 'unknown'
> = T extends unknown
  ? P extends []
    ? T
    : MaxDepth extends 0
      ? TypeFailure<'OinPathValue: exceeded MaxDepth', Mode>
      : P[0] extends number
        ? T extends readonly (infer U)[]
          ? OinPathValue<U, Tail<P>, PrevDepth<MaxDepth>, Mode>
          : TypeFailure<'OinPathValue: invalid array path', Mode>
        : P[0] extends keyof T
          ? OinPathValue<T[P[0]], Tail<P>, PrevDepth<MaxDepth>, Mode>
          : TypeFailure<'OinPathValue: invalid object path', Mode>
  : never;

export type OinErrorHandlerFor<T, MaxDepth extends number = 5> = (
  error: unknown,
  path: OinPathOf<T, MaxDepth>,
  operation: OinMutationOp
) => void;

export type OinMutationOp =
  | 'set'
  | 'reset'
  | 'commit'
  | 'push'
  | 'pop'
  | 'splice'
  | 'sort'
  | 'applyUpdate';

export type OinErrorHandler = (
  error: unknown,
  path: OinPath,
  operation: OinMutationOp
) => void;
