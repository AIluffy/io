import { getInternal } from './internal-access.js';
import type { IoLink } from '../types/types.js';

const IO_LINK = Symbol.for('@org/io/link');

export function link<T>(target: T): IoLink<T> {
  const internal = getInternal(target);
  if (!internal) throw new TypeError('link: target is not an IO node');
  const wrapper: Record<PropertyKey, unknown> = {};
  Object.defineProperty(wrapper, IO_LINK, {
    value: target,
    enumerable: false,
  });
  return wrapper as IoLink<T>;
}

export function isLink(value: unknown): value is IoLink<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  return Object.prototype.hasOwnProperty.call(value, IO_LINK);
}

export function getLinkTarget<T>(value: IoLink<T>): T {
  return (value as Record<PropertyKey, unknown>)[
    IO_LINK
  ] as T;
}
