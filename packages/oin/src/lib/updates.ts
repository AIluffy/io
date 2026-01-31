import type { OinPatch, OinUnit, OinUpdate } from './types.js';

const INTERNAL = Symbol.for('@org/oin/internal');

type InternalUnit = {
  kind: 'unit';
  setValue: (
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ) => void;
};

type InternalScope = {
  kind: 'scope';
  getUnit?: (key: string) => OinUnit<unknown> | undefined;
  getChild?: (key: string) => unknown;
  applySet: (
    key: string,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ) => void;
};

type InternalArray = {
  kind: 'array';
  getChild?: (index: number) => unknown;
  setIndex: (
    index: number,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ) => void;
  applySplice: (
    start: number,
    deleteCount: number,
    items: unknown[],
    options?: { emitValue?: boolean }
  ) => void;
  applySortOrder: (order: number[], options?: { emitValue?: boolean }) => void;
};

type Internal =
  | InternalUnit
  | InternalScope
  | InternalArray
  | {
      kind: 'derived';
    };

function getInternal(value: unknown): Internal | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'function' && typeof value !== 'object')
    return undefined;
  const internal = (value as unknown as Record<PropertyKey, unknown>)[INTERNAL];
  if (typeof internal !== 'object' || internal === null) return undefined;
  const kind = (internal as { kind?: unknown }).kind;
  if (
    kind === 'unit' ||
    kind === 'scope' ||
    kind === 'array' ||
    kind === 'derived'
  )
    return internal as Internal;
  return undefined;
}

function newId(): string {
  const cryptoObj = (globalThis as Record<PropertyKey, unknown>).crypto;
  if (typeof cryptoObj === 'object' && cryptoObj !== null) {
    const randomUUID = (cryptoObj as { randomUUID?: unknown }).randomUUID;
    if (typeof randomUUID === 'function') {
      return (randomUUID as (this: unknown) => string).call(cryptoObj);
    }
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function createUpdate(
  baseRevision: number,
  revision: number,
  patches: OinPatch[]
): OinUpdate {
  return { id: newId(), baseRevision, revision, patches };
}

export function mergeUpdates(updates: OinUpdate[]): OinUpdate {
  if (updates.length === 0) return createUpdate(0, 0, []);
  if (updates.length === 1) return updates[0];

  const merged: OinPatch[] = [];
  for (const update of updates) {
    for (const patch of update.patches) {
      const last = merged[merged.length - 1];
      if (
        last &&
        last.op === 'set' &&
        patch.op === 'set' &&
        JSON.stringify(last.path) === JSON.stringify(patch.path)
      ) {
        merged[merged.length - 1] = { ...last, next: patch.next };
        continue;
      }
      merged.push(patch);
    }
  }

  const first = updates[0];
  const last = updates[updates.length - 1];
  return createUpdate(first.baseRevision, last.revision, merged);
}

export function invertUpdate(update: OinUpdate): OinUpdate {
  const inverted: OinPatch[] = [];
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

export function applyUpdate(target: unknown, update: OinUpdate): void {
  const rootInternal = getInternal(target);
  if (!rootInternal) throw new Error('applyUpdate: target is not an OIN node');

  const resolveNode = (
    root: unknown,
    path: ReadonlyArray<string | number>
  ): unknown => {
    let current: unknown = root;
    for (const segment of path) {
      const internal = getInternal(current);
      if (!internal)
        throw new Error('applyUpdate: path traversed into non-node');

      if (internal.kind === 'scope') {
        if (typeof segment !== 'string')
          throw new Error('applyUpdate: invalid scope path segment');
        current =
          internal.getChild?.(segment) ??
          internal.getUnit?.(segment) ??
          (current as unknown as Record<PropertyKey, unknown>)[segment];
        continue;
      }

      if (internal.kind === 'array') {
        if (typeof segment !== 'number')
          throw new Error('applyUpdate: invalid array path segment');
        current =
          internal.getChild?.(segment) ??
          (current as unknown as Record<PropertyKey, unknown>)[segment];
        continue;
      }

      throw new Error('applyUpdate: path traversed into leaf node');
    }
    return current;
  };

  for (const patch of update.patches) {
    if (patch.op === 'set') {
      if (patch.path.length === 0) {
        const internal = getInternal(target);
        if (!internal || internal.kind !== 'unit') {
          throw new Error('applyUpdate: unsupported root set');
        }
        internal.setValue(patch.next, { emitUpdate: false, emitValue: true });
        continue;
      }

      const parentPath = patch.path.slice(0, -1);
      const last = patch.path[patch.path.length - 1];
      const parentNode = resolveNode(target, parentPath);
      const parentInternal = getInternal(parentNode);
      if (!parentInternal) throw new Error('applyUpdate: invalid parent node');

      if (parentInternal.kind === 'scope') {
        if (typeof last !== 'string')
          throw new Error('applyUpdate: invalid scope key');
        parentInternal.applySet(last, patch.next, {
          emitUpdate: false,
          emitValue: true,
        });
        continue;
      }

      if (parentInternal.kind === 'array') {
        if (typeof last !== 'number')
          throw new Error('applyUpdate: invalid array index');
        parentInternal.setIndex(last, patch.next, {
          emitUpdate: false,
          emitValue: true,
        });
        continue;
      }

      throw new Error('applyUpdate: set target is not a container');
    }

    if (patch.op === 'splice') {
      const arrayNode = resolveNode(target, patch.path);
      const arrayInternal = getInternal(arrayNode);
      if (!arrayInternal || arrayInternal.kind !== 'array')
        throw new Error('applyUpdate: splice target is not array');
      arrayInternal.applySplice(patch.start, patch.deleteCount, patch.items, {
        emitValue: true,
      });
      continue;
    }

    if (patch.op === 'sort') {
      const arrayNode = resolveNode(target, patch.path);
      const arrayInternal = getInternal(arrayNode);
      if (!arrayInternal || arrayInternal.kind !== 'array')
        throw new Error('applyUpdate: sort target is not array');
      arrayInternal.applySortOrder(patch.order, { emitValue: true });
      continue;
    }

    throw new Error('applyUpdate: unsupported patch');
  }
}

export function replay(target: unknown, updates: OinUpdate[]): void {
  for (const update of updates) applyUpdate(target, update);
}
