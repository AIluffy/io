import type { OinNode, OinResult } from './types.js';
import { createArrayUnit } from './array-unit.js';
import { oinTree } from './oin-tree.js';
import { createScope } from './scope.js';
import { createUnit } from './unit.js';

/**
 * Create an OIN node from any value.
 *
 * @example
 * const count = oin(1);
 * count(2);
 * count();
 *
 * @example
 * const list = oin([1, { n: 1 }]);
 * list[0]();
 * list[1].n(2);
 *
 * @example
 * const user = oin({ profile: { name: 'a' } });
 * user.profile.name('b');
 * user.snapshot();
 */
export function oin<T>(target: T, options?: { silent?: boolean }): OinResult<T>;
export function oin(target: unknown, options?: { silent?: boolean }): unknown {
  if (Array.isArray(target))
    return oinTree(target, { silent: options?.silent });
  if (isPlainObject(target))
    return oinTree(target, { silent: options?.silent });
  if (target !== null && typeof target === 'object') {
    if (options?.silent) return createUnit(target);
    throw new TypeError(
      'oin: deep mode only supports plain objects and arrays',
    );
  }
  return createUnit(target);
}

export function oinShallow<T>(initial: T): OinNode<T>;
export function oinShallow(initial: unknown): OinNode<unknown> {
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
