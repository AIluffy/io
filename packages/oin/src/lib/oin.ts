import type { OinNode } from './types.js';
import { createArrayUnit } from './array-unit.js';
import { createScope } from './scope.js';
import { createUnit } from './unit.js';

export function oin<T>(initial: T): OinNode<T>;
export function oin(initial: unknown): OinNode<unknown> {
  if (Array.isArray(initial))
    return createArrayUnit(initial) as unknown as OinNode<unknown>;
  if (isPlainObject(initial))
    return createScope(initial) as unknown as OinNode<unknown>;
  return createUnit(initial) as unknown as OinNode<unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
