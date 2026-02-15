import type { IoPatch } from '../../utils/types.js';
import type { TreeArrayState, TreeNode } from '../tree/io-tree-types.js';
import type { NodePath } from '../tree/path-trie.js';
import type { SnapshotCache } from '../snapshot/snapshot-cache.js';

import { clearDirtyIndices, resetDirtyIndices } from '../mutation/dirty-indices.js';
import { createSnapshotCache } from '../snapshot/snapshot-cache.js';
import type { TreeCommand } from './command.js';

type PerformSpliceResult = {
  normalizedStart: number;
  dc: number;
  removedValues: unknown[];
};

type CompareFn = (a: unknown, b: unknown) => number;

export type ArrayCommandDeps = {
  path: NodePath;
  createTreeNode: (path: NodePath, initial: unknown) => TreeNode;
  attachChildToArray: (state: TreeArrayState, child: TreeNode) => void;
  detachChildFromArray: (state: TreeArrayState, child: TreeNode) => void;
  unregisterSubtree: (path: NodePath, node: TreeNode) => void;
  getNodeValue: (node: TreeNode, cache: SnapshotCache) => unknown;
  cloneValue: (value: unknown) => unknown;
  resolvePatchValue: (value: unknown) => unknown;
  snapshot: () => unknown[];
  rebuildMapping: () => void;
  performSplice: (
    start: number,
    deleteCount: number,
    items: unknown[],
  ) => PerformSpliceResult;
  validateSortPermutation: (order: number[], length: number) => void;
};

export class PushCommand implements TreeCommand<TreeArrayState> {
  readonly op = 'push' as const;

  constructor(
    private readonly deps: ArrayCommandDeps,
    private readonly items: unknown[],
  ) {}

  validate(): boolean {
    return this.items.length > 0;
  }

  execute(state: TreeArrayState): IoPatch[] | null {
    const start = state.children.length;
    const created = this.items.map((value, index) =>
      this.deps.createTreeNode([...this.deps.path, start + index], value),
    );

    for (const child of created) this.deps.attachChildToArray(state, child);
    state.children.push(...created);
    state.dirtyStructure = true;
    resetDirtyIndices(state.dirtyIndices, state.children.length);
    this.deps.rebuildMapping();

    return [
      {
        op: 'splice',
        path: [],
        start,
        deleteCount: 0,
        deleted: [],
        items: this.items.map((value) => this.deps.resolvePatchValue(value)),
      },
    ];
  }
}

export class PopCommand implements TreeCommand<TreeArrayState> {
  readonly op = 'pop' as const;
  result: unknown = undefined;

  constructor(private readonly deps: ArrayCommandDeps) {}

  validate(state: TreeArrayState): boolean {
    return state.children.length > 0;
  }

  execute(state: TreeArrayState): IoPatch[] | null {
    const start = state.children.length - 1;
    const removed = state.children.pop();
    if (!removed) return null;

    const readCache = createSnapshotCache();
    const removedValue = this.deps.getNodeValue(removed, readCache);
    this.result = removedValue;
    this.deps.detachChildFromArray(state, removed);
    this.deps.unregisterSubtree([...this.deps.path, start], removed);
    state.dirtyStructure = true;
    resetDirtyIndices(state.dirtyIndices, state.children.length);
    this.deps.rebuildMapping();

    return [
      {
        op: 'splice',
        path: [],
        start,
        deleteCount: 1,
        deleted: [this.deps.cloneValue(removedValue)],
        items: [],
      },
    ];
  }
}

export class SpliceCommand implements TreeCommand<TreeArrayState> {
  readonly op = 'splice' as const;

  constructor(
    private readonly deps: ArrayCommandDeps,
    private readonly start: number,
    private readonly deleteCount: number,
    private readonly items: unknown[],
    private readonly options?: { emitPatch?: boolean },
  ) {}

  execute(state: TreeArrayState): IoPatch[] {
    const { normalizedStart, dc, removedValues } = this.deps.performSplice(
      this.start,
      this.deleteCount,
      this.items,
    );
    state.dirtyStructure = true;
    resetDirtyIndices(state.dirtyIndices, state.children.length);

    if (this.options?.emitPatch === false) return [];
    return [
      {
        op: 'splice',
        path: [],
        start: normalizedStart,
        deleteCount: dc,
        deleted: removedValues.map((value) => this.deps.cloneValue(value)),
        items: this.items.map((value) => this.deps.resolvePatchValue(value)),
      },
    ];
  }
}

export class SortCommand implements TreeCommand<TreeArrayState> {
  readonly op = 'sort' as const;

  constructor(
    private readonly deps: ArrayCommandDeps,
    private readonly options?: {
      order?: number[];
      compareFn?: CompareFn;
    },
  ) {}

  validate(state: TreeArrayState): boolean {
    if (state.children.length <= 1) return false;
    if (this.options?.order) {
      this.deps.validateSortPermutation(
        this.options.order,
        state.children.length,
      );
    }
    return true;
  }

  execute(state: TreeArrayState): IoPatch[] {
    let order: number[];
    if (this.options?.order) {
      const old = state.children.slice();
      order = this.options.order;
      state.children = order.map((oldIndex) => old[oldIndex]);
    } else {
      const readCache = createSnapshotCache();
      const decorated = state.children.map((child, index) => ({
        child,
        index,
        value: this.deps.getNodeValue(child, readCache),
      }));
      decorated.sort((a, b) => {
        const av = a.value;
        const bv = b.value;
        if (this.options?.compareFn) return this.options.compareFn(av, bv);
        if (typeof av === 'number' && typeof bv === 'number') return av - bv;
        const as = String(av);
        const bs = String(bv);
        if (as === bs) return 0;
        return as > bs ? 1 : -1;
      });
      order = decorated.map((entry) => entry.index);
      state.children = decorated.map((entry) => entry.child);
    }

    state.dirtyStructure = true;
    state.childIndicesDirty = true;
    clearDirtyIndices(state.dirtyIndices);
    this.deps.rebuildMapping();

    return [
      {
        op: 'sort',
        path: [],
        order,
      },
    ];
  }
}

export class SetCommand implements TreeCommand<TreeArrayState> {
  readonly op = 'set' as const;

  constructor(
    private readonly deps: ArrayCommandDeps,
    private readonly next: unknown[],
  ) {}

  execute(state: TreeArrayState): IoPatch[] {
    const prevValue = this.deps.snapshot();
    this.deps.performSplice(0, state.children.length, this.next);
    state.dirtyStructure = true;
    resetDirtyIndices(state.dirtyIndices, state.children.length);
    this.deps.rebuildMapping();

    return [
      {
        op: 'set',
        path: [],
        prev: this.deps.cloneValue(prevValue),
        next: this.deps.cloneValue(
          this.next.map((value) => this.deps.resolvePatchValue(value)),
        ),
      },
    ];
  }
}
