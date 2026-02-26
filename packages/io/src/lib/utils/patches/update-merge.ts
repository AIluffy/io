import type { IoPatch, IoUpdate, IoUpdateAnnotation } from '../types/types.js';

const PATH_KEY_CACHE = new WeakMap<object, string>();

let updateIdSeed: string | undefined;
let updateIdCounter = 0;

function resolveUpdateIdSeed(): string {
  if (updateIdSeed) return updateIdSeed;
  updateIdSeed = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return updateIdSeed;
}

function newId(): string {
  updateIdCounter += 1;
  return `${resolveUpdateIdSeed()}-${updateIdCounter.toString(36)}`;
}

export function createUpdate(
  baseRevision: number,
  revision: number,
  patches: IoPatch[],
  annotation?: IoUpdateAnnotation,
): IoUpdate {
  const update: IoUpdate = {
    id: newId(),
    baseRevision,
    revision,
    patches,
  };
  if (annotation?.action !== undefined) update.action = annotation.action;
  if (annotation?.meta !== undefined) update.meta = annotation.meta;
  return update;
}

function pathKey(path: ReadonlyArray<PropertyKey>): string {
  const cached = PATH_KEY_CACHE.get(path as object);
  if (cached) return cached;
  let out = '';
  for (let i = 0; i < path.length; i += 1) {
    const seg = path[i];
    if (typeof seg === 'number') {
      out += `|n:${seg}`;
      continue;
    }
    if (typeof seg === 'symbol') {
      out += `|y:${String(seg)}`;
      continue;
    }
    const escaped = seg.replace(/([\\|:])/g, '\\$1');
    out += `|s:${escaped}`;
  }
  PATH_KEY_CACHE.set(path as object, out);
  return out;
}

export function mergeUpdates(updates: IoUpdate[]): IoUpdate;
export function mergeUpdates(...updates: IoUpdate[]): IoUpdate;
export function mergeUpdates(
  updatesOrFirst: IoUpdate[] | IoUpdate,
  ...rest: IoUpdate[]
): IoUpdate {
  if (!updatesOrFirst) return createUpdate(0, 0, []);
  const updates = Array.isArray(updatesOrFirst)
    ? updatesOrFirst
    : [updatesOrFirst, ...rest];
  if (updates.length === 0) return createUpdate(0, 0, []);
  if (updates.length === 1) return updates[0];

  const merged: IoPatch[] = [];
  for (const update of updates) {
    for (const patch of update.patches) {
      const last = merged[merged.length - 1];
      if (
        last &&
        last.op === 'set' &&
        patch.op === 'set' &&
        (last.path === patch.path ||
          pathKey(last.path) === pathKey(patch.path))
      ) {
        merged[merged.length - 1] = { ...last, next: patch.next };
        continue;
      }
      merged.push(patch);
    }
  }

  const first = updates[0];
  const last = updates[updates.length - 1];
  let mergedAction: string | undefined;
  let actionMixed = false;
  for (const update of updates) {
    if (update.action === undefined) continue;
    if (mergedAction === undefined) {
      mergedAction = update.action;
      continue;
    }
    if (mergedAction !== update.action) {
      actionMixed = true;
      break;
    }
  }

  let mergedMeta: IoUpdate['meta'] | undefined;
  for (let i = updates.length - 1; i >= 0; i -= 1) {
    const candidate = updates[i].meta;
    if (candidate !== undefined) {
      mergedMeta = candidate;
      break;
    }
  }

  return createUpdate(first.baseRevision, last.revision, merged, {
    action: actionMixed ? 'batch' : mergedAction,
    meta: mergedMeta,
  });
}
