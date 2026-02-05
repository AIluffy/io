import type { OinNode, OinResult } from '../utils/types.js';

import { oinTree } from './oin-tree.js';
import { createUnit } from '../units/unit.js';
import { isPlainObject } from '../utils/plain-object.js';

type OinOptions = { shallow?: boolean; silent?: boolean };

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
export function oin<T>(
  target: T,
  options: { shallow: true; silent?: boolean },
): OinNode<T>;
export function oin<T>(
  target: T,
  options?: { shallow?: false; silent?: boolean },
): OinResult<T>;
export function oin(target: unknown, options?: OinOptions): unknown {
  if (options?.shallow === true) {
    if (Array.isArray(target))
      return oinTree(target, { maxDepth: 1 }) as unknown as OinNode<unknown>;
    if (isPlainObject(target))
      return oinTree(target, { maxDepth: 1 }) as unknown as OinNode<unknown>;
    return createUnit(target) as unknown as OinNode<unknown>;
  }

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
