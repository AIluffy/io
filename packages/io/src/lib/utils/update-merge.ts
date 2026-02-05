import type { IoPatch, IoUpdate } from './types.js';

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
  patches: IoPatch[],
): IoUpdate {
  return { id: newId(), baseRevision, revision, patches };
}

function pathKey(path: ReadonlyArray<PropertyKey>): string {
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
  return out;
}

export function mergeUpdates(updates: IoUpdate[]): IoUpdate {
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
        pathKey(last.path) === pathKey(patch.path)
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
