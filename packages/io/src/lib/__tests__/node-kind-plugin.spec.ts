import { describe, expect, it, vi } from 'vitest';
import {
  createNodeFromKindPlugin,
  createNodeKindPlugin,
} from '../core/node-factory/node-kind-plugin.js';
import { getInternal } from '../utils/internal/internal-access.js';

describe('core/node-factory/node-kind-plugin', () => {
  it('passes getNode through initialize/createSnapshot/finalize runtime args', () => {
    const calls: string[] = [];
    const node = {} as {
      get?: () => unknown;
      snapshot?: () => unknown;
      subscribe?: (fn: (value: unknown) => void) => () => void;
      subscribeUpdate?: (fn: (update: unknown) => void) => () => void;
    };

    const plugin = createNodeKindPlugin({
      kind: 'test',
      createState: () => ({
        node,
        revision: 0,
        isCommitting: false,
        valueEpoch: 0,
        snapshotCache: { value: undefined, version: -1, hasValue: false },
        dirtyStructure: false,
        valueListeners: new Set(),
        updateListeners: new Set(),
        ctx: {} as never,
        path: [],
      }),
      createNode: () => ({ target: node as object, node: node as never }),
      initialize: (args) => {
        expect(args.getNode()).toBe(node);
        expect(args.snapshot()).toBeUndefined();
        calls.push('initialize');
      },
      createSnapshot: (args) => {
        expect(args.getNode()).toBe(node);
        expect(args.snapshot()).toBeUndefined();
        calls.push('createSnapshot');
        return () => ({ ok: true });
      },
      createOperations: () => ({ set: vi.fn() }),
      createCommit: () => undefined,
      createInternal: (args) => {
        expect(args.operations.set).toBeTypeOf('function');
        return { kind: 'derived' as const };
      },
      defineProperties: ({ commit }) => ({
        hasCommit: { value: typeof commit === 'function' },
      }),
      finalize: (args) => {
        expect(args.getNode()).toBe(node);
        expect(args.snapshot()).toBeUndefined();
        calls.push('finalize');
      },
    });

    const created = createNodeFromKindPlugin(
      {
        deps: {
          trackRead: vi.fn(),
          internals: {
            INTERNAL: Symbol.for('@iostore/store/internal'),
            registerInternal: vi.fn(),
          },
        } as never,
        ctx: { seen: new WeakMap<object, unknown>() } as never,
        path: ['x'],
        initial: {} as Record<string, unknown>,
        createTreeNode: vi.fn() as never,
        resolvePatchValue: (value) => value,
      },
      plugin as never,
    ) as typeof node;

    expect(created).toBe(node);
    expect(calls).toEqual(['initialize', 'createSnapshot', 'finalize']);
    expect(node.snapshot?.()).toEqual({ ok: true });
    expect(getInternal(node)).toMatchObject({ kind: 'derived' });
  });
});
