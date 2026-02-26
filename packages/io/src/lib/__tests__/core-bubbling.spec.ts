import { describe, expect, it, vi } from 'vitest';
import {
  subscribeIndexedChild,
  subscribeKeyedChild,
} from '../core/mutation/bubbling.js';

describe('core/bubbling', () => {
  it('returns no-op unsubscribers when child is not subscribable', () => {
    const { valueUnsub, updateUnsub } = subscribeKeyedChild(
      {},
      'k',
      {},
    );

    expect(() => valueUnsub()).not.toThrow();
    expect(() => updateUnsub()).not.toThrow();
  });

  it('skips indexed update callback when resolved indices are empty', () => {
    let triggerUpdate: ((u: { patches: unknown[] }) => void) | undefined;
    const child = {
      subscribeUpdate: (fn: (u: { patches: unknown[] }) => void) => {
        triggerUpdate = fn;
        return () => undefined;
      },
    };
    const onUpdate = vi.fn();

    subscribeIndexedChild(
      child,
      () => [],
      { onUpdate: (u, indices) => onUpdate(u, indices) },
    );
    triggerUpdate?.({ patches: [] });

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('bubbles keyed child update path when handlers are provided', () => {
    let triggerUpdate:
      | ((u: { patches: Array<{ path: readonly PropertyKey[] }> }) => void)
      | undefined;
    const child = {
      subscribeUpdate: (
        fn: (u: { patches: Array<{ path: readonly PropertyKey[] }> }) => void,
      ) => {
        triggerUpdate = fn;
        return () => undefined;
      },
    };
    const seen: Array<PropertyKey[]> = [];

    subscribeKeyedChild(child, 'root', {
      onUpdate: (u) => {
        const first = u.patches[0];
        seen.push([...first.path]);
      },
    });
    triggerUpdate?.({ patches: [{ path: ['leaf'] }] });

    expect(seen).toEqual([['root', 'leaf']]);
  });
});
