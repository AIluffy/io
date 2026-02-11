export type DirtyIndexState = {
  items: number[];
  marks: Int32Array;
  version: number;
};

const MAX_VERSION = 0x7fffffff;

export function createDirtyIndexState(length: number): DirtyIndexState {
  return {
    items: [],
    marks: new Int32Array(length),
    version: 1,
  };
}

export function resetDirtyIndices(
  state: DirtyIndexState,
  length: number,
): void {
  if (state.marks.length !== length) {
    state.marks = new Int32Array(length);
  } else {
    state.marks.fill(0);
  }
  state.items.length = 0;
  state.version = 1;
}

export function clearDirtyIndices(state: DirtyIndexState): void {
  if (state.items.length === 0) return;
  state.items.length = 0;
  state.version += 1;
  if (state.version >= MAX_VERSION) {
    state.marks.fill(0);
    state.version = 1;
  }
}

export function markDirtyIndex(
  state: DirtyIndexState,
  index: number,
  length?: number,
): void {
  const limit = length ?? state.marks.length;
  if (index < 0 || index >= limit) return;
  if (state.marks[index] === state.version) return;
  state.marks[index] = state.version;
  state.items.push(index);
}
