import { describe, expect, it } from 'vitest';
import { derived } from '../core/api/derived.js';
import { io } from '../core/api/io.js';
import { relocate } from '../extensions/relocate.js';
import { registerInternal } from '../utils/internal/internal-access.js';

describe('extensions: relocate', () => {
  it('creates writable view for unit targets', () => {
    const state = io({ count: 1 });
    const view = relocate<number>(state, ['count']);

    view.set?.((prev) => prev + 2);
    expect(view.get()).toBe(3);
    expect(view.snapshot?.()).toBe(3);
  });

  it('creates readonly view for derived targets', () => {
    const count = io(2);
    const plusOne = derived(() => count.get() + 1);
    const view = relocate<number>(plusOne, []);

    expect(view.get()).toBe(3);
    expect(view.snapshot?.()).toBe(3);
    expect(view.set).toBeUndefined();
  });

  it('forwards subscribe for unit and derived targets', async () => {
    const unit = io(1);
    const unitView = relocate<number>(unit, []);
    const seenUnit: number[] = [];
    const unsubUnit = unitView.subscribe((v) => seenUnit.push(v));

    unit.set(2);
    unsubUnit();

    const plusOne = derived(() => unit.get() + 1);
    const derivedView = relocate<number>(plusOne, []);
    const seenDerived: number[] = [];
    const unsubDerived = derivedView.subscribe((v) => seenDerived.push(v));
    unit.set(3);
    await Promise.resolve();
    unsubDerived();

    expect(seenUnit).toContain(2);
    expect(seenDerived).toContain(4);
  });

  it('creates readable view for scope and array targets', () => {
    const scopeNode = io({ user: { age: 20 } });
    const arrayNode = io([{ id: 1 }, { id: 2 }]);

    const scopeView = relocate<{ user: { age: number } }>(scopeNode, []);
    const arrayView = relocate<Array<{ id: number }>>(arrayNode, []);

    expect(scopeView.get().user.age).toBe(20);
    expect(arrayView.get().map((item) => item.id)).toEqual([1, 2]);
    expect(scopeView.snapshot?.().user.age).toBe(20);
    expect(arrayView.snapshot?.().map((item) => item.id)).toEqual([1, 2]);
  });

  it('forwards subscribe for scope and array targets', () => {
    const scopeNode = io({ user: { age: 20 } });
    const arrayNode = io([{ id: 1 }]);
    const scopeView = relocate<{ user: { age: number } }>(scopeNode, []);
    const arrayView = relocate<Array<{ id: number }>>(arrayNode, []);
    const seenScope: number[] = [];
    const seenArray: number[] = [];

    const unsubScope = scopeView.subscribe((value) => seenScope.push(value.user.age));
    const unsubArray = arrayView.subscribe((value) => seenArray.push(value.length));

    scopeNode.user.age.set(21);
    arrayNode.push({ id: 2 });
    unsubScope();
    unsubArray();

    expect(seenScope).toContain(21);
    expect(seenArray).toContain(2);
  });

  it('supports numeric-string array segments', () => {
    const state = io([{ name: 'a' }, { name: 'b' }]);
    const view = relocate<{ name: string }>(state, ['1']);

    expect(view.get().name).toBe('b');
  });

  it('throws for invalid scope segments', () => {
    const state = io({ count: 1 });

    expect(() => relocate(state, [0])).toThrow('relocate: invalid scope key');
  });

  it('throws for invalid array segments', () => {
    const state = io([1, 2, 3]);

    expect(() => relocate(state, [Symbol('idx')])).toThrow(
      'relocate: invalid array index',
    );
  });

  it('throws when path traverses into leaf nodes', () => {
    const leaf = io(1);

    expect(() => relocate(leaf, ['x'])).toThrow(
      'relocate: path traversed into leaf',
    );
  });

  it('throws when traversal enters a non-node value', () => {
    const state = io({});

    expect(() => relocate(state, ['missing', 'x'])).toThrow(
      'relocate: path traversed into non-node',
    );
  });

  it('throws when target is not a node', () => {
    const state = io({});

    expect(() => relocate(state, ['missing'])).toThrow(
      'relocate: target is not a node',
    );
  });

  it('throws when scope-like targets are not readable', () => {
    const fakeScope = {};
    registerInternal(fakeScope, { kind: 'scope' });

    expect(() => relocate(fakeScope, [])).toThrow(
      'relocate: target is not readable',
    );
  });

  it('throws for unsupported target kinds', () => {
    const unsupported = {
      get: () => 1,
      snapshot: () => 1,
      subscribe: () => () => undefined,
    };
    registerInternal(
      unsupported,
      { kind: 'custom' } as unknown as { kind: 'unit' | 'scope' | 'array' | 'derived' },
    );

    expect(() => relocate(unsupported, [])).toThrow(
      'relocate: unsupported target',
    );
  });
});
