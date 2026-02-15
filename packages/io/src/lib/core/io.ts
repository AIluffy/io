import type { IoNode, IoResult } from '../utils/types.js';

import { ioTree } from './io-tree.js';
import { createUnit } from '../units/unit.js';
import { isPlainObject } from '../utils/plain-object.js';

type IoOptions = { shallow?: boolean };

function asIoNode(value: unknown): IoNode<unknown> {
  return value as IoNode<unknown>;
}

/**
 * Create an IO node from any value.
 *
 * @example
 * const count = io(1);
 * count.set(2);
 * count.get();
 *
 * @example
 * const list = io([1, { n: 1 }]);
 * list[0].get();
 * list[1].n.set(2);
 *
 * @example
 * const user = io({ profile: { name: 'a' } });
 * user.profile.name.set('b');
 * user.snapshot();
 */
export function io<T>(
  target: T,
  options: { shallow: true },
): IoNode<T>;
export function io<T>(
  target: T,
  options?: { shallow?: false },
): IoResult<T>;
export function io(target: unknown, options?: IoOptions): unknown {
  if (options?.shallow === true) {
    if (Array.isArray(target))
      return asIoNode(ioTree(target, { maxDepth: 1 }));
    if (isPlainObject(target))
      return asIoNode(ioTree(target, { maxDepth: 1 }));
    return asIoNode(createUnit(target));
  }

  if (Array.isArray(target))
    return ioTree(target);
  if (isPlainObject(target))
    return ioTree(target);
  if (target !== null && typeof target === 'object') {
    throw new TypeError(
      'io: deep mode only supports plain objects and arrays',
    );
  }
  return createUnit(target);
}
