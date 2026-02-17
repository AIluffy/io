import type { ValueEpoch } from '../../utils/types/branded.js';
import type { DirtyIndexState } from './dirty-indices.js';
import type { NodePath } from '../tree/path-trie.js';

export type MutationScopeStateLike<TNode> = {
  children: Map<PropertyKey, TNode>;
  path: NodePath;
  valueEpoch: ValueEpoch;
  dirtyKeys: Set<PropertyKey>;
  dirtyStructure: boolean;
  isCommitting: boolean;
};

export type MutationArrayStateLike<TNode> = {
  children: TNode[];
  path: NodePath;
  valueEpoch: ValueEpoch;
  dirtyIndices: DirtyIndexState;
  dirtyStructure: boolean;
  isCommitting: boolean;
};
