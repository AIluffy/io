import type { IoPatch, IoUnit, IoUpdate } from './types.js';

import { notifyUpdate } from './batch.js';
import { emitError } from './debug.js';
import { getInternal as getAnyInternal } from './internal-access.js';
import { createUpdate } from './update-merge.js';

type InternalUnit = {
  kind: 'unit';
  setValue: (
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
  getState?: () => unknown;
};

type InternalScope = {
  kind: 'scope';
  getUnit?: (key: PropertyKey) => IoUnit<unknown> | undefined;
  getChild?: (key: PropertyKey) => unknown;
  applySet: (
    key: PropertyKey,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
  getState?: () => unknown;
};

type InternalArray = {
  kind: 'array';
  getChild?: (index: number) => unknown;
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
  getState?: () => unknown;
};

type Internal =
  | InternalUnit
  | InternalScope
  | InternalArray
  | {
      kind: 'derived';
    };

function getInternal(value: unknown): Internal | undefined {
  return getAnyInternal(value) as Internal | undefined;
}

export { createUpdate, mergeUpdates } from './update-merge.js';

export function undoUpdate(update: IoUpdate): IoUpdate {
  const inverted: IoPatch[] = [];
  for (let i = update.patches.length - 1; i >= 0; i -= 1) {
    const patch = update.patches[i];
    if (patch.op === 'set') {
      inverted.push({
        op: 'set',
        path: patch.path,
        prev: patch.next,
        next: patch.prev,
      });
      continue;
    }
    if (patch.op === 'splice') {
      inverted.push({
        op: 'splice',
        path: patch.path,
        start: patch.start,
        deleteCount: patch.items.length,
        deleted: patch.items,
        items: patch.deleted,
      });
      continue;
    }
    const invOrder = new Array<number>(patch.order.length);
    for (let newIndex = 0; newIndex < patch.order.length; newIndex += 1) {
      const oldIndex = patch.order[newIndex];
      invOrder[oldIndex] = newIndex;
    }
    inverted.push({ op: 'sort', path: patch.path, order: invOrder });
  }

  return createUpdate(update.revision, update.baseRevision, inverted);
}

export function applyUpdate(
  target: unknown,
  update: IoUpdate,
  options?: { emitUpdate?: boolean },
): void;
export function applyUpdate(
  target: unknown,
  updates: IoUpdate[],
  options?: { emitUpdate?: boolean },
): void;
export function applyUpdate(
  target: unknown,
  updateOrUpdates: IoUpdate | IoUpdate[],
  options?: { emitUpdate?: boolean },
): void {
  if (Array.isArray(updateOrUpdates)) {
    for (const update of updateOrUpdates) {
      applyUpdate(target, update, options);
    }
    return;
  }
  const update = updateOrUpdates;
  if (!getInternal(target))
    throw new Error('applyUpdate: target is not an IO node');

  const resolveNode = (root: unknown, path: ReadonlyArray<PropertyKey>) => {
    let current: unknown = root;
    for (const segment of path) {
      const internal = getInternal(current);
      if (!internal)
        throw new Error('applyUpdate: path traversed into non-node');

      if (internal.kind === 'scope') {
        // Allow symbol keys for scope
        if (typeof segment !== 'string' && typeof segment !== 'symbol')
          throw new Error('applyUpdate: invalid scope path segment');
        current =
          (typeof segment === 'string'
            ? (internal.getChild?.(segment) ?? internal.getUnit?.(segment))
            : undefined) ??
          (current as Record<PropertyKey, unknown>)[segment];
        continue;
      }

      if (internal.kind === 'array') {
        if (typeof segment !== 'number')
          throw new Error('applyUpdate: invalid array path segment');
        current =
          internal.getChild?.(segment) ??
          (current as Record<PropertyKey, unknown>)[segment];
        continue;
      }

      throw new Error('applyUpdate: path traversed into leaf node');
    }
    return current;
  };

  type PatchHandlerMap = {
    [K in IoPatch['op']]: (patch: Extract<IoPatch, { op: K }>) => void;
  };

  const handlers: PatchHandlerMap = {
    set: (patch) => {
      if (patch.path.length === 0) {
        const internal = getInternal(target);
        if (!internal || internal.kind !== 'unit') {
          throw new Error('applyUpdate: unsupported root set');
        }
        internal.setValue(patch.next, { emitUpdate: false, emitValue: true });
        return;
      }

      const parentPath = patch.path.slice(0, -1);
      const last = patch.path[patch.path.length - 1];
      const parentNode = resolveNode(target, parentPath);
      const parentInternal = getInternal(parentNode);
      if (!parentInternal) throw new Error('applyUpdate: invalid parent node');

      if (parentInternal.kind === 'scope') {
        if (typeof last !== 'string' && typeof last !== 'symbol')
          throw new Error('applyUpdate: invalid scope key');

        parentInternal.applySet(last, patch.next, {
          emitUpdate: false,
          emitValue: true,
        });
        return;
      }

      if (parentInternal.kind === 'array') {
        if (typeof last !== 'number')
          throw new Error('applyUpdate: invalid array index');
        parentInternal.setIndex(last, patch.next, {
          emitUpdate: false,
          emitValue: true,
        });
        return;
      }

      throw new Error('applyUpdate: set target is not a container');
    },
    splice: (patch) => {
      const arrayNode = resolveNode(target, patch.path);
      const arrayInternal = getInternal(arrayNode);
      if (!arrayInternal || arrayInternal.kind !== 'array')
        throw new Error('applyUpdate: splice target is not array');
      arrayInternal.applySplice(patch.start, patch.deleteCount, patch.items, {
        emitValue: true,
      });
    },
    sort: (patch) => {
      const arrayNode = resolveNode(target, patch.path);
      const arrayInternal = getInternal(arrayNode);
      if (!arrayInternal || arrayInternal.kind !== 'array')
        throw new Error('applyUpdate: sort target is not array');
      arrayInternal.applySortOrder(patch.order, { emitValue: true });
    },
  };

  for (const patch of update.patches) {
    try {
      handlers[patch.op](patch as never);
    } catch (error) {
      emitError(target, error, patch.path, 'applyUpdate');
      throw error;
    }
  }

  if (options?.emitUpdate) {
    const internal = getInternal(target);
    const state = (
      internal as { getState?: () => unknown }
    )?.getState?.();
    const listeners = (
      state as { updateListeners?: Set<(u: IoUpdate) => void> }
    ).updateListeners;
    if (listeners && listeners instanceof Set) notifyUpdate(listeners, update);
  }
}

export function replay(target: unknown, updates: IoUpdate[]): void {
  applyUpdate(target, updates);
}
