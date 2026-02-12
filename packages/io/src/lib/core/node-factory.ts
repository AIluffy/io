import { getLinkTarget, isLink } from '../utils/link.js';
import type { NodePath } from './path-trie.js';
import type {
  TreeContext,
  TreeNode,
} from './io-tree-types.js';
import type { NodeFactoryDeps } from './node-factory/types.js';
import { createArrayNode as createArrayNodeImpl } from './node-factory/array/node.js';
import { createScopeNode as createScopeNodeImpl } from './node-factory/scope/node.js';
import {
  collectTargetPaths,
  formatPath,
  isPathPrefix,
} from './node-factory/link.js';

export type { NodeFactoryDeps } from './node-factory/types.js';

/**
 * Builds the tree-node constructor used by `ioTree`.
 *
 * The factory chooses node kind (scope/array/unit), maintains path mappings,
 * and enforces constraints around links, cycles, and shared references.
 */
export function createNodeFactory(deps: NodeFactoryDeps) {
  // Patch payloads must be immutable snapshots. Linked nodes need resolving to
  // values so update logs stay serializable and replay-safe.
  /**
   * Converts values stored in patches to immutable/replay-safe payloads.
   *
   * Link values are resolved to snapshots so patches do not depend on runtime
   * object identity.
   */
  const resolvePatchValue = (value: unknown): unknown => {
    if (isLink(value)) {
      const target = getLinkTarget(value) as TreeNode;
      return deps.getNodeValue(target, new WeakMap());
    }
    return deps.cloneValue(value);
  };

  /**
   * Creates a unit leaf and registers it under the current path subtree index.
   */
  const createUnitNode = (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ): TreeNode => {
    const unit = deps.createUnit(deps.cloneValue(initial)) as TreeNode;
    deps.registerSubtree(ctx, path, unit);
    return unit;
  };

  /**
   * Creates a scope node wrapper and injects recursive creation callbacks.
   */
  const createScopeNode = (
    ctx: TreeContext,
    path: NodePath,
    initial: Record<string, unknown>,
  ): TreeNode =>
    createScopeNodeImpl({
      deps,
      ctx,
      path,
      initial,
      createTreeNode,
      resolvePatchValue,
    });

  /**
   * Creates an array node wrapper and injects recursive creation callbacks.
   */
  const createArrayNode = (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown[],
  ): TreeNode =>
    createArrayNodeImpl({
      deps,
      ctx,
      path,
      initial,
      createTreeNode,
      resolvePatchValue,
    });

  /**
   * Recursively creates a tree node at `path`.
   *
   * Rules:
   * - Links reuse target nodes, but reject prefix cycles in same context.
   * - `maxDepth` forces leaf-unit nodes to cap recursion.
   * - Arrays/scopes are expanded recursively.
   * - Non-plain objects in deep mode are rejected.
   *
   * Invariants:
   * - Every returned node is reachable through trie/path mapping.
   * - Shared object references are forbidden for array elements.
   */
  const createTreeNode = (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ): TreeNode => {
    if (isLink(initial)) {
      const target = getLinkTarget(initial) as TreeNode;
      const internal = deps.getInternal(target);
      if (!internal)
        throw new TypeError('ioTree: link target is not an IO node');

      if (internal.kind === 'scope' || internal.kind === 'array') {
        const state = (internal as { getState?: () => unknown }).getState?.();
        const linkCtx = (state as { ctx?: unknown } | undefined)?.ctx;
        const linkPath = (state as { path?: NodePath } | undefined)?.path;
        if (linkCtx === ctx) {
          const targetPaths = collectTargetPaths(ctx, target);
          const pathsToCheck =
            targetPaths.length > 0
              ? targetPaths
              : linkPath
                ? [linkPath]
                : [];
          for (const candidate of pathsToCheck) {
            if (!isPathPrefix(candidate, path)) continue;
            throw new TypeError(
              `ioTree link: cycle detected at ${formatPath(path)} -> ${formatPath(candidate)}`,
            );
          }
        }
        if (linkCtx === ctx) {
          deps.registerSubtree(ctx, path, target);
        } else {
          deps.setPathNode(ctx, path, target);
        }
        return target;
      }

      deps.registerSubtree(ctx, path, target);
      return target;
    }

    if (typeof ctx.maxDepth === 'number' && path.length >= ctx.maxDepth) {
      return createUnitNode(ctx, path, initial);
    }
    if (initial !== null && typeof initial === 'object') {
      const existing = ctx.seen.get(initial as object);
      if (existing) {
        const last = path[path.length - 1];
        if (typeof last === 'number') {
          throw new TypeError(
            'ioTree array: shared object references are not allowed',
          );
        }
        deps.setPathNode(ctx, path, existing);
        return existing;
      }
    }
    if (Array.isArray(initial)) return createArrayNode(ctx, path, initial);
    if (deps.isPlainObject(initial))
      return createScopeNode(ctx, path, initial as Record<string, unknown>);
    if (initial !== null && typeof initial === 'object') {
      throw new TypeError(
        'ioTree: deep mode only supports plain objects and arrays',
      );
    }
    return createUnitNode(ctx, path, initial);
  };

  return { createTreeNode };
}
