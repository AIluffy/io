import { describe, expect, it } from 'vitest';
import { collectTargetPaths, isPathPrefix } from '../core/node-factory/link.js';

describe('node-factory: link helpers', () => {
  it('isPathPrefix handles longer and mismatched prefixes', () => {
    expect(isPathPrefix(['a', 'b'], ['a'])).toBe(false);
    expect(isPathPrefix(['a', 'x'], ['a', 'b'])).toBe(false);
    expect(isPathPrefix(['a'], ['a', 'b'])).toBe(true);
  });

  it('collectTargetPaths returns paths only when devtools is enabled', () => {
    const target = { id: 't' };
    const root = {
      node: undefined,
      children: new Map<PropertyKey, unknown>([
        [
          'a',
          {
            node: target,
            children: new Map<PropertyKey, unknown>(),
          },
        ],
        [
          'b',
          {
            node: undefined,
            children: new Map<PropertyKey, unknown>([
              [
                0,
                {
                  node: target,
                  children: new Map<PropertyKey, unknown>(),
                },
              ],
            ]),
          },
        ],
      ]),
    };

    expect(
      collectTargetPaths(
        { devtools: undefined, root } as never,
        target as never,
      ),
    ).toEqual([]);

    expect(
      collectTargetPaths(
        { devtools: {}, root } as never,
        target as never,
      ),
    ).toEqual([['a'], ['b', 0]]);
  });
});
