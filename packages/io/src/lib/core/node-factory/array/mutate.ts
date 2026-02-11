import type { CreateArrayMutationsOptions } from './mutate-types.js';
import { createArrayIndexMutation } from './index-mutation.js';
import { createArrayStructuralMutations } from './structural-mutations.js';

export function createArrayMutations(options: CreateArrayMutationsOptions): {
  applySplice: (
    start: number,
    deleteCount: number,
    items: unknown[],
    options?: { emitValue?: boolean },
  ) => void;
  applySortOrder: (
    order: number[],
    options?: { emitValue?: boolean },
  ) => void;
  setIndex: (
    index: number,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
  set: (next: unknown[]) => void;
  push: (...items: unknown[]) => void;
  pop: () => unknown;
  splice: (start: number, deleteCount: number, ...items: unknown[]) => void;
  sort: (compareFn?: (a: unknown, b: unknown) => number) => void;
} {
  const { setIndex } = createArrayIndexMutation(options);
  const {
    applySplice,
    applySortOrder,
    set,
    push,
    pop,
    splice,
    sort,
  } = createArrayStructuralMutations(options);

  return {
    applySplice,
    applySortOrder,
    setIndex,
    set,
    push,
    pop,
    splice,
    sort,
  };
}
