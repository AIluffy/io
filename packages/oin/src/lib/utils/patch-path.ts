import type { OinPatch, OinUpdate } from './types.js';

export function prependPatchPath(segment: PropertyKey, patch: OinPatch): OinPatch {
  return { ...patch, path: [segment, ...patch.path] };
}

export function prependUpdatePath(segment: PropertyKey, update: OinUpdate): OinUpdate {
  return { ...update, patches: update.patches.map((p) => prependPatchPath(segment, p)) };
}