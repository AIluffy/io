import { describe, expect, it, vi } from 'vitest';
import { emitError, onError, onMutation } from '../utils/debug/debug.js';
import { registerInternal } from '../utils/internal/internal-access.js';

describe('debug utils', () => {
  it('emitError no-ops when internal state is missing or invalid', () => {
    expect(() => emitError({}, new Error('e'), [], 'set')).not.toThrow();

    const target = {};
    registerInternal(target, {
      kind: 'unit',
      getState: () => null,
    });
    expect(() => emitError(target, new Error('e'), [], 'set')).not.toThrow();
  });

  it('emitError prefers ctx.errorListeners over root listeners', () => {
    const rootListener = vi.fn();
    const ctxListener = vi.fn();
    const target = {};
    registerInternal(target, {
      kind: 'scope',
      getState: () => ({
        errorListeners: new Set([rootListener]),
        ctx: {
          errorListeners: new Set([ctxListener]),
        },
      }),
    });

    const error = new Error('boom');
    emitError(target, error, ['a'], 'set');

    expect(ctxListener).toHaveBeenCalledWith(error, ['a'], 'set');
    expect(rootListener).not.toHaveBeenCalled();
  });

  it('onError reuses existing listener container and unsubscribes', () => {
    const existing = new Set<(...args: unknown[]) => void>();
    const target = {};
    registerInternal(target, {
      kind: 'scope',
      getState: () => ({
        ctx: { errorListeners: existing },
      }),
    });

    const handler = vi.fn();
    const unsub = onError(target, handler);
    expect(existing.has(handler)).toBe(true);

    emitError(target, new Error('x'), [], 'set');
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    expect(existing.has(handler)).toBe(false);
  });

  it('onMutation fans out all patches from each update', () => {
    const subscribeUpdate = vi.fn((cb: (u: { patches: Array<{ path: string[]; op: 'set' }> }) => void) => {
      cb({
        patches: [
          { op: 'set', path: ['a'] },
          { op: 'set', path: ['b'] },
        ],
      });
      return () => undefined;
    });

    const calls: string[] = [];
    onMutation(
      { subscribeUpdate },
      (patch) => {
        calls.push(patch.path[0] as string);
      },
    );

    expect(calls).toEqual(['a', 'b']);
  });
});
