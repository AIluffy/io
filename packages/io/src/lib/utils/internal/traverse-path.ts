import type { IoInternal } from './internal-access.js';

import { getInternal as getAnyInternal } from './internal-access.js';

type TraversableInternal = Pick<IoInternal, 'kind'>;

type TraversePathOptions<TInternal extends TraversableInternal> = {
  getInternal?: (value: unknown) => TInternal | undefined;
  isScopeSegment?: (segment: PropertyKey) => boolean;
  isArraySegment?: (segment: PropertyKey) => boolean;
  resolveScopeChild?: (
    node: unknown,
    internal: Extract<TInternal, { kind: 'scope' }>,
    segment: PropertyKey,
  ) => unknown;
  resolveArrayChild?: (
    node: unknown,
    internal: Extract<TInternal, { kind: 'array' }>,
    segment: PropertyKey,
  ) => unknown;
  onNonNode: (path: ReadonlyArray<PropertyKey>, index: number) => string;
  onInvalidScopeSegment: (
    path: ReadonlyArray<PropertyKey>,
    index: number,
  ) => string;
  onInvalidArraySegment: (
    path: ReadonlyArray<PropertyKey>,
    index: number,
  ) => string;
  onLeaf: (path: ReadonlyArray<PropertyKey>, index: number) => string;
};

const defaultIsScopeSegment = (segment: PropertyKey): boolean => {
  return typeof segment === 'string' || typeof segment === 'symbol';
};

const defaultIsArraySegment = (segment: PropertyKey): boolean => {
  return typeof segment === 'number';
};

const defaultResolveChild = (
  node: unknown,
  segment: PropertyKey,
): unknown => {
  return (node as Record<PropertyKey, unknown>)[segment];
};

export function traversePath<TInternal extends TraversableInternal>(
  root: unknown,
  path: ReadonlyArray<PropertyKey>,
  options: TraversePathOptions<TInternal>,
): unknown {
  const getInternal = options.getInternal ?? getAnyInternal;
  const isScopeSegment = options.isScopeSegment ?? defaultIsScopeSegment;
  const isArraySegment = options.isArraySegment ?? defaultIsArraySegment;
  const resolveScopeChild =
    options.resolveScopeChild ??
    ((node: unknown, _internal, segment: PropertyKey): unknown => {
      return defaultResolveChild(node, segment);
    });
  const resolveArrayChild =
    options.resolveArrayChild ??
    ((node: unknown, _internal, segment: PropertyKey): unknown => {
      return defaultResolveChild(node, segment);
    });

  let current: unknown = root;
  for (let i = 0; i < path.length; i += 1) {
    const segment = path[i];
    const internal = getInternal(current);
    if (!internal) throw new Error(options.onNonNode(path, i));

    if (internal.kind === 'scope') {
      if (!isScopeSegment(segment)) {
        throw new Error(options.onInvalidScopeSegment(path, i));
      }
      current = resolveScopeChild(
        current,
        internal as Extract<TInternal, { kind: 'scope' }>,
        segment,
      );
      continue;
    }

    if (internal.kind === 'array') {
      if (!isArraySegment(segment)) {
        throw new Error(options.onInvalidArraySegment(path, i));
      }
      current = resolveArrayChild(
        current,
        internal as Extract<TInternal, { kind: 'array' }>,
        segment,
      );
      continue;
    }

    throw new Error(options.onLeaf(path, i));
  }

  return current;
}
