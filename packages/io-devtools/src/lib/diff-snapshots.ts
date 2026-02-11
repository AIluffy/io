import type { IoPath } from './types.js';
import type { IoSnapshotDiff } from './types.js';

type DiffOptions = {
  maxDepth?: number;
  maxChanges?: number;
  maxArrayLength?: number;
};

const defaultOptions: Required<DiffOptions> = {
  maxDepth: 6,
  maxChanges: 500,
  maxArrayLength: 200,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function diffSnapshots(
  prev: unknown,
  next: unknown,
  options?: DiffOptions
): IoSnapshotDiff[] {
  const o = { ...defaultOptions, ...(options ?? {}) };
  const diffs: IoSnapshotDiff[] = [];

  const visit = (path: IoPath, a: unknown, b: unknown, depth: number) => {
    if (diffs.length >= o.maxChanges) return;
    if (Object.is(a, b)) return;
    if (depth >= o.maxDepth) {
      diffs.push({ path, prev: a, next: b });
      return;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      const len = Math.max(a.length, b.length);
      const capped = Math.min(len, o.maxArrayLength);
      for (let i = 0; i < capped; i += 1) {
        visit([...path, i], a[i], b[i], depth + 1);
        if (diffs.length >= o.maxChanges) return;
      }
      if (len !== capped) diffs.push({ path, prev: a, next: b });
      return;
    }

    if (isRecord(a) && isRecord(b)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) {
        visit([...path, key], a[key], b[key], depth + 1);
        if (diffs.length >= o.maxChanges) return;
      }
      return;
    }

    diffs.push({ path, prev: a, next: b });
  };

  visit([], prev, next, 0);
  return diffs;
}
