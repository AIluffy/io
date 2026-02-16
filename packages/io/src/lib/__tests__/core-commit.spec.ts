import { describe, expect, it } from 'vitest';
import { isPlainObject } from '../utils/immutable/plain-object.js';
import {
  createDirtyIndexState,
  markDirtyIndex,
} from '../core/mutation/dirty-indices.js';
import { applyArrayCommitDiff, applyScopeCommitDiff } from '../core/mutation/commit.js';
import type { ValueEpoch } from '../utils/types/branded.js';
import { initialEpoch } from '../utils/types/branded.js';

type Path = PropertyKey[];

type FakeScopeState = {
  children: Map<PropertyKey, FakeNode>;
  path: readonly PropertyKey[];
  valueEpoch: ValueEpoch;
  dirtyKeys: Set<PropertyKey>;
  dirtyStructure: boolean;
  isCommitting: boolean;
};

type FakeArrayState = {
  children: FakeNode[];
  path: readonly PropertyKey[];
  valueEpoch: ValueEpoch;
  dirtyIndices: ReturnType<typeof createDirtyIndexState>;
  dirtyStructure: boolean;
  isCommitting: boolean;
};

type FakeNode =
  | { kind: 'unit'; value: unknown }
  | { kind: 'scope'; state: FakeScopeState }
  | { kind: 'array'; state: FakeArrayState };

function pathKey(path: readonly PropertyKey[]): string {
  return JSON.stringify(path.map((segment) => String(segment)));
}

function createGraph(rootValue: unknown): {
  root: FakeNode;
  pathNodes: Map<string, FakeNode>;
} {
  const pathNodes = new Map<string, FakeNode>();

  const createNode = (value: unknown, path: Path): FakeNode => {
    if (Array.isArray(value)) {
      const children = value.map((item, index) =>
        createNode(item, [...path, index]),
      );
      const state: FakeArrayState = {
        children,
        path,
        valueEpoch: initialEpoch(),
        dirtyIndices: createDirtyIndexState(children.length),
        dirtyStructure: false,
        isCommitting: false,
      };
      const node: FakeNode = { kind: 'array', state };
      pathNodes.set(pathKey(path), node);
      return node;
    }

    if (isPlainObject(value)) {
      const children = new Map<PropertyKey, FakeNode>();
      for (const key of Reflect.ownKeys(value)) {
        children.set(
          key,
          createNode((value as Record<PropertyKey, unknown>)[key], [
            ...path,
            key,
          ]),
        );
      }
      const state: FakeScopeState = {
        children,
        path,
        valueEpoch: initialEpoch(),
        dirtyKeys: new Set(),
        dirtyStructure: false,
        isCommitting: false,
      };
      const node: FakeNode = { kind: 'scope', state };
      pathNodes.set(pathKey(path), node);
      return node;
    }

    return { kind: 'unit', value };
  };

  return { root: createNode(rootValue, []), pathNodes };
}

function nodeValue(node: FakeNode): unknown {
  if (node.kind === 'unit') return node.value;
  if (node.kind === 'array')
    return node.state.children.map((child) => nodeValue(child));
  const out: Record<PropertyKey, unknown> = {};
  for (const [key, child] of node.state.children.entries()) {
    out[key] = nodeValue(child);
  }
  return out;
}

function createDeps(
  pathNodes: Map<string, FakeNode>,
  options?: {
    getInternalKind?: (node: FakeNode) => 'scope' | 'array' | 'unit';
  },
) {
  return {
    isPlainObject,
    isUnit: (node: FakeNode) => node.kind === 'unit',
    isLink: (value: unknown) =>
      isPlainObject(value) &&
      (value as { __isLink?: boolean }).__isLink === true,
    getInternalKind: (node: FakeNode) =>
      options?.getInternalKind ? options.getInternalKind(node) : node.kind,
    getScopeState: (node: FakeNode) =>
      (node as { state: FakeScopeState }).state,
    getArrayState: (node: FakeNode) =>
      (node as { state: FakeArrayState }).state,
    setUnitValue: (node: FakeNode, next: unknown) => {
      (node as { value: unknown }).value = next;
    },
    getNodeValue: (node: FakeNode) => nodeValue(node),
    resolvePatchValue: (value: unknown) =>
      isPlainObject(value) && (value as { __isLink?: boolean }).__isLink
        ? (value as { value: unknown }).value
        : value,
    createTreeNode: (path: readonly PropertyKey[], next: unknown): FakeNode => {
      const normalized =
        isPlainObject(next) && (next as { __isLink?: boolean }).__isLink
          ? (next as { value: unknown }).value
          : next;
      const created = createGraph(normalized).root;
      pathNodes.set(pathKey(path), created);
      return created;
    },
    detachChildFromScope: () => {
      return undefined;
    },
    attachChildToScope: () => {
      return undefined;
    },
    detachChildFromArray: () => {
      return undefined;
    },
    attachChildToArray: () => {
      return undefined;
    },
    unregisterSubtree: (path: readonly PropertyKey[]) => {
      pathNodes.delete(pathKey(path));
    },
    registerSubtree: (path: readonly PropertyKey[], node: FakeNode) => {
      pathNodes.set(pathKey(path), node);
    },
    getPathNode: (path: readonly PropertyKey[]) => pathNodes.get(pathKey(path)),
    emitScopeValue: () => {
      return undefined;
    },
    emitArrayValue: () => {
      return undefined;
    },
    markDirty: (
      state: FakeScopeState | FakeArrayState,
      segment: PropertyKey,
    ) => {
      if ('dirtyKeys' in state) {
        state.dirtyKeys.add(segment);
        return;
      }
      if (typeof segment === 'number') {
        markDirtyIndex(state.dirtyIndices, segment, state.children.length);
      }
    },
    cloneValue: (value: unknown) => value,
  };
}

describe('core/commit', () => {
  it('diffs nested scope and array children and emits set patches', () => {
    const before = { profile: { age: 1 }, items: [1, 2] };
    const next = { profile: { age: 2 }, items: [1, 3] };
    const graph = createGraph(before);
    const root = graph.root as { state: FakeScopeState };
    const deps = createDeps(graph.pathNodes);

    const result = applyScopeCommitDiff(root.state, before, next, deps);

    expect(result.changed).toBe(true);
    expect(result.patches).toEqual([
      { op: 'set', path: ['profile', 'age'], prev: 1, next: 2 },
      { op: 'set', path: ['items', 1], prev: 2, next: 3 },
    ]);
    expect(root.state.dirtyKeys.has('profile')).toBe(true);
    expect(root.state.dirtyKeys.has('items')).toBe(true);
  });

  it('replaces scope child when next value is a link payload', () => {
    const before = { count: 1 };
    const graph = createGraph(before);
    const root = graph.root as { state: FakeScopeState };
    const deps = createDeps(graph.pathNodes);
    const next = { count: { __isLink: true, value: 9 } };

    const result = applyScopeCommitDiff(
      root.state,
      before,
      next as Record<PropertyKey, unknown>,
      deps,
    );

    expect(result.changed).toBe(true);
    expect(result.patches).toEqual([
      { op: 'set', path: ['count'], prev: 1, next: 9 },
    ]);
  });

  it('rebuilds array children when length changes', () => {
    const before = [1, 2];
    const next = [1, 2, 3];
    const graph = createGraph(before);
    const root = graph.root as { state: FakeArrayState };
    const deps = createDeps(graph.pathNodes);

    const result = applyArrayCommitDiff(root.state, before, next, deps);

    expect(result.changed).toBe(true);
    expect(result.patches).toEqual([
      {
        op: 'splice',
        path: [],
        start: 0,
        deleteCount: 2,
        deleted: [1, 2],
        items: [1, 2, 3],
      },
    ]);
    expect(root.state.children).toHaveLength(3);
    expect(root.state.dirtyStructure).toBe(true);
  });

  it('throws when next scope introduces unknown key', () => {
    const before = { a: 1 };
    const next = { a: 1, b: 2 };
    const graph = createGraph(before);
    const root = graph.root as { state: FakeScopeState };
    const deps = createDeps(graph.pathNodes);

    expect(() => applyScopeCommitDiff(root.state, before, next, deps)).toThrow(
      /unknown key/,
    );
  });

  it('falls back to replacing non-unit scope children when shape changes', () => {
    const before = { item: { id: 1 } };
    const next = { item: 5 };
    const graph = createGraph(before);
    const root = graph.root as { state: FakeScopeState };
    const deps = createDeps(graph.pathNodes);

    const result = applyScopeCommitDiff(root.state, before, next, deps);

    expect(result.changed).toBe(true);
    expect(result.patches).toEqual([
      { op: 'set', path: ['item'], prev: { id: 1 }, next: 5 },
    ]);
  });

  it('replaces array children for incompatible shape at same index', () => {
    const before = [{ id: 1 }];
    const next = [5];
    const graph = createGraph(before);
    const root = graph.root as { state: FakeArrayState };
    const deps = createDeps(graph.pathNodes);

    const result = applyArrayCommitDiff(root.state, before, next, deps);

    expect(result.changed).toBe(true);
    expect(result.patches).toEqual([
      { op: 'set', path: [0], prev: { id: 1 }, next: 5 },
    ]);
  });

  it('recurses object and array diffs through array slots', () => {
    const before = [{ profile: { age: 1 }, nested: [[1]] }];
    const next = [{ profile: { age: 2 }, nested: [[2]] }];
    const graph = createGraph(before);
    const root = graph.root as { state: FakeArrayState };
    const deps = createDeps(graph.pathNodes);

    const result = applyArrayCommitDiff(root.state, before, next, deps);

    expect(result.changed).toBe(true);
    expect(result.patches).toEqual([
      { op: 'set', path: [0, 'profile', 'age'], prev: 1, next: 2 },
      { op: 'set', path: [0, 'nested', 0, 0], prev: 1, next: 2 },
    ]);
  });

  it('keeps deep patch paths stable when commit diff reuses a path stack', () => {
    const before = {
      left: { child: { value: 1 } },
      right: { child: { value: 2 } },
    };
    const next = {
      left: { child: { value: 10 } },
      right: { child: { value: 20 } },
    };
    const graph = createGraph(before);
    const root = graph.root as { state: FakeScopeState };
    const deps = createDeps(graph.pathNodes);

    const result = applyScopeCommitDiff(root.state, before, next, deps);

    expect(result.changed).toBe(true);
    expect(result.patches).toEqual([
      { op: 'set', path: ['left', 'child', 'value'], prev: 1, next: 10 },
      { op: 'set', path: ['right', 'child', 'value'], prev: 2, next: 20 },
    ]);

    const leftPatch = result.patches.find(
      (patch) => patch.op === 'set' && patch.path[0] === 'left',
    );
    const rightPatch = result.patches.find(
      (patch) => patch.op === 'set' && patch.path[0] === 'right',
    );
    if (!leftPatch || !rightPatch) {
      throw new Error('expected both left and right patches');
    }
    expect(leftPatch.path).not.toBe(rightPatch.path);

    (leftPatch.path as PropertyKey[]).push('mutated');
    expect(rightPatch.path).toEqual(['right', 'child', 'value']);
  });

  it('handles symbol keys by surfacing invalid array-segment replacement', () => {
    const key = Symbol('k');
    const before = { [key]: { id: 1 } } as Record<PropertyKey, unknown>;
    const next = { [key]: 2 } as Record<PropertyKey, unknown>;
    const graph = createGraph(before);
    const root = graph.root as { state: FakeScopeState };
    const deps = createDeps(graph.pathNodes);

    expect(() => applyScopeCommitDiff(root.state, before, next, deps)).toThrow(
      /invalid segment/,
    );
  });

  it('executes applyNodeDiff scope-recursion branch', () => {
    const before = { item: { nested: { value: 1 } } };
    const next = { item: { nested: { value: 2 } } };
    const graph = createGraph(before);
    const root = graph.root as { state: FakeScopeState };
    const itemNode = root.state.children.get('item') as FakeNode;
    let seenItem = false;
    const deps = createDeps(graph.pathNodes, {
      getInternalKind: (node) => {
        if (node === itemNode) {
          if (!seenItem) {
            seenItem = true;
            return 'unit';
          }
          return 'scope';
        }
        return node.kind;
      },
    });

    const result = applyScopeCommitDiff(root.state, before, next, deps);

    expect(result.changed).toBe(true);
    expect(result.patches).toEqual([
      { op: 'set', path: ['item', 'nested', 'value'], prev: 1, next: 2 },
    ]);
  });

  it('executes applyNodeDiff array-recursion branch', () => {
    const before = [{ nested: [1] }];
    const next = [{ nested: [2] }];
    const graph = createGraph(before);
    const root = graph.root as { state: FakeArrayState };
    const idxNode = root.state.children[0] as FakeNode;
    let seenIndex = false;
    const deps = createDeps(graph.pathNodes, {
      getInternalKind: (node) => {
        if (node === idxNode) {
          if (!seenIndex) {
            seenIndex = true;
            return 'unit';
          }
          return 'scope';
        }
        return node.kind;
      },
    });

    const result = applyArrayCommitDiff(root.state, before, next, deps);

    expect(result.changed).toBe(true);
    expect(result.patches).toEqual([
      { op: 'set', path: [0, 'nested', 0], prev: 1, next: 2 },
    ]);
  });
});
