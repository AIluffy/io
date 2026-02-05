import type { IoNode, IoResult } from '../utils/types.js';

import { ioTree } from './io-tree.js';
import { createUnit } from '../units/unit.js';
import { isPlainObject } from '../utils/plain-object.js';

type IoOptions = { shallow?: boolean; silent?: boolean };

/**
 * Create an IO node from any value.
 *
 * @example
 * const count = io(1);
 * count(2);
 * count();
 *
 * @example
 * const list = io([1, { n: 1 }]);
 * list[0]();
 * list[1].n(2);
 *
 * @example
 * const user = io({ profile: { name: 'a' } });
 * user.profile.name('b');
 * user.snapshot();
 */
export function io<T>(
  target: T,
  options: { shallow: true; silent?: boolean },
): IoNode<T>;
export function io<T>(
  target: T,
  options?: { shallow?: false; silent?: boolean },
): IoResult<T>;
export function io(target: unknown, options?: IoOptions): unknown {
  if (options?.shallow === true) {
    if (Array.isArray(target))
      return ioTree(target, { maxDepth: 1 }) as unknown as IoNode<unknown>;
    if (isPlainObject(target))
      return ioTree(target, { maxDepth: 1 }) as unknown as IoNode<unknown>;
    return createUnit(target) as unknown as IoNode<unknown>;
  }

  if (Array.isArray(target))
    return ioTree(target, { silent: options?.silent });
  if (isPlainObject(target))
    return ioTree(target, { silent: options?.silent });
  if (target !== null && typeof target === 'object') {
    if (options?.silent) return createUnit(target);
    throw new TypeError(
      'io: deep mode only supports plain objects and arrays',
    );
  }
  return createUnit(target);
}
