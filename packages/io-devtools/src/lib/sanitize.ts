import type { IoDevtoolsExportOptions } from './types.js';
import type { IoPath } from './types.js';

type InternalOptions = Required<IoDevtoolsExportOptions>;

const defaultOptions: InternalOptions = {
  maxDepth: 8,
  maxArrayLength: 200,
  maxStringLength: 10_000,
  redact: (_path, value) => value,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampString(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + `…(${value.length - max} more)`;
}

export function sanitizeForJson(value: unknown, options?: IoDevtoolsExportOptions): unknown {
  const o: InternalOptions = { ...defaultOptions, ...(options ?? {}) };

  const walk = (path: IoPath, v: unknown, depth: number): unknown => {
    const redacted = o.redact(path, v);
    if (depth >= o.maxDepth) return '[MaxDepth]';
    if (redacted === null) return null;
    if (redacted === undefined) return undefined;
    if (typeof redacted === 'string') return clampString(redacted, o.maxStringLength);
    if (typeof redacted === 'number') return Number.isFinite(redacted) ? redacted : String(redacted);
    if (typeof redacted === 'boolean') return redacted;
    if (typeof redacted === 'bigint') return redacted.toString();
    if (typeof redacted === 'symbol') return redacted.toString();
    if (typeof redacted === 'function') return '[Function]';
    if (redacted instanceof Date) return redacted.toISOString();
    if (redacted instanceof Error) {
      return {
        name: redacted.name,
        message: redacted.message,
        stack: redacted.stack,
      };
    }
    if (Array.isArray(redacted)) {
      const out = [];
      const capped = Math.min(redacted.length, o.maxArrayLength);
      for (let i = 0; i < capped; i += 1) out.push(walk([...path, i], redacted[i], depth + 1));
      if (redacted.length > capped) out.push(`[+${redacted.length - capped} more items]`);
      return out;
    }
    if (isRecord(redacted)) {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(redacted)) {
        out[k] = walk([...path, k], child, depth + 1);
      }
      return out;
    }
    try {
      return JSON.parse(JSON.stringify(redacted));
    } catch {
      return String(redacted);
    }
  };

  return walk([], value, 0);
}
