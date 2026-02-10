import type {
  IoErrorHandler,
  IoTreeArrayUnit,
  IoTreeScope,
  IoUnit,
  IoUnsubscribe,
  IoUpdate,
} from '../utils/types.js';
import type { VersionedCache } from '../container/cache.js';
import type { NodePath, PathTrieContext } from './path-trie.js';

export type TreeScopeNode = IoTreeScope<Record<string, unknown>>;
export type TreeArrayNode = IoTreeArrayUnit<unknown>;
export type TreeNode = IoUnit<unknown> | TreeScopeNode | TreeArrayNode;

export type TreeContext = PathTrieContext<TreeNode> & {
  errorListeners: Set<IoErrorHandler>;
  maxDepth?: number;
  seen: WeakMap<object, TreeNode>;
};

export type UnitInternal = {
  kind: 'unit';
  getValue: () => unknown;
  setValue: (
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
  getState: () => unknown;
};

export type TreeScopeInternal = {
  kind: 'scope';
  getChild: (key: PropertyKey) => TreeNode | undefined;
  applySet: (
    key: PropertyKey,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
  getState: () => TreeScopeState;
};

export type TreeArrayInternal = {
  kind: 'array';
  getChild: (index: number) => TreeNode | undefined;
  setIndex: (
    index: number,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
  applySplice: (
    start: number,
    deleteCount: number,
    items: unknown[],
    options?: { emitValue?: boolean },
  ) => void;
  applySortOrder: (order: number[], options?: { emitValue?: boolean }) => void;
  getState: () => TreeArrayState;
};

export type TreeInternal =
  | UnitInternal
  | TreeScopeInternal
  | TreeArrayInternal
  | { kind: 'derived' };

export type TreeScopeState = {
  children: Map<PropertyKey, TreeNode>;
  node: TreeNode;
  revision: number;
  isCommitting: boolean;
  valueEpoch: number;
  snapshotCache: VersionedCache<Record<string, unknown>>;
  dirtyKeys: Set<PropertyKey>;
  dirtyStructure: boolean;
  valueListeners: Set<(value: Record<string, unknown>) => void>;
  updateListeners: Set<(update: IoUpdate) => void>;
  childValueUnsubs: Map<PropertyKey, IoUnsubscribe>;
  childUpdateUnsubs: Map<PropertyKey, IoUnsubscribe>;
  ctx: TreeContext;
  path: NodePath;
};

export type TreeArrayState = {
  children: TreeNode[];
  node: TreeNode;
  revision: number;
  isCommitting: boolean;
  valueEpoch: number;
  snapshotCache: VersionedCache<unknown[]>;
  dirtyIndices: Set<number>;
  dirtyStructure: boolean;
  valueListeners: Set<(value: unknown[]) => void>;
  updateListeners: Set<(update: IoUpdate) => void>;
  childValueUnsubs: Map<TreeNode, { unsub: IoUnsubscribe; count: number }>;
  childUpdateUnsubs: Map<TreeNode, { unsub: IoUnsubscribe; count: number }>;
  ctx: TreeContext;
  path: NodePath;
};
