import { describe, expect, it, vi } from 'vitest';
import { attachNodeBase } from '../core/node-factory/create-node-base.js';
import { INTERNAL } from '../utils/internal/internal-access.js';

describe('core/node-factory/create-node-base', () => {
  it('attaches base api without extra properties', () => {
    const registerInternal = vi.fn();
    const target: Record<PropertyKey, unknown> = {};
    const internal = { kind: 'unit' as const } as never;

    attachNodeBase({
      deps: {
        internals: {
          INTERNAL,
          registerInternal,
        },
      } as never,
      target,
      internal,
      snapshot: () => 1,
      get: () => 1,
      subscribe: () => () => undefined,
      subscribeUpdate: () => () => undefined,
    });

    expect(typeof target.get).toBe('function');
    expect(typeof target.snapshot).toBe('function');
    expect(registerInternal).toHaveBeenCalledWith(target, internal);
  });

  it('registers internals for all registerTargets and includes custom properties', () => {
    const registerInternal = vi.fn();
    const target: Record<PropertyKey, unknown> = {};
    const alias: Record<PropertyKey, unknown> = {};
    const internal = { kind: 'scope' as const } as never;

    attachNodeBase({
      deps: {
        internals: {
          INTERNAL,
          registerInternal,
        },
      } as never,
      target,
      internal,
      snapshot: () => ({ ok: true }),
      get: () => ({ ok: true }),
      subscribe: () => () => undefined,
      subscribeUpdate: () => () => undefined,
      properties: {
        custom: { value: 123 },
      },
      registerTargets: [target, alias],
    });

    expect(target.custom).toBe(123);
    expect(registerInternal).toHaveBeenCalledTimes(2);
    expect(registerInternal).toHaveBeenNthCalledWith(1, target, internal);
    expect(registerInternal).toHaveBeenNthCalledWith(2, alias, internal);
  });
});
