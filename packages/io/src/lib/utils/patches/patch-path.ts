import type { IoPatch, IoUpdate } from '../types/types.js';

export function prependPatchPath(segment: PropertyKey, patch: IoPatch): IoPatch {
  return { ...patch, path: [segment, ...patch.path] };
}

export function prependUpdatePath(segment: PropertyKey, update: IoUpdate): IoUpdate {
  return { ...update, patches: update.patches.map((p) => prependPatchPath(segment, p)) };
}