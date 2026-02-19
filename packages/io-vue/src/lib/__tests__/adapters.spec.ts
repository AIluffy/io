import { describe, expect, it } from 'vitest';
import type { Ref, ShallowRef } from 'vue';
import { effectScope } from 'vue';
import { io } from '@iostore/store';
import { ioRef, useIO, useIOSelector } from '../adapters.js';

describe('@iostore/vue', () => {
  it('exports adapters', () => {
    expect(typeof useIO).toBe('function');
    expect(typeof useIOSelector).toBe('function');
    expect(typeof ioRef).toBe('function');
  });

  it('supports updates', async () => {
    const scope = effectScope();
    let output = 0;
    let state: ShallowRef<number> | undefined;
    scope.run(() => {
      const count = io(0);
      state = useIO(count);
      expect(state?.value).toBe(0);
      count.set(2);
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    output = state?.value ?? 0;
    scope.stop();
    expect(output).toBe(2);
  });

  it('supports custom ref updates', async () => {
    const scope = effectScope();
    let output = 0;
    let ref: Ref<number> | undefined;
    scope.run(() => {
      const count = io(0);
      ref = ioRef(count);
      expect(ref?.value).toBe(0);
      count.set(3);
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    output = ref?.value ?? 0;
    scope.stop();
    expect(output).toBe(3);
  });

  it('supports sync schedule in useIO', () => {
    const scope = effectScope();
    let state: ShallowRef<number> | undefined;
    scope.run(() => {
      const count = io(0);
      state = useIO(count, { schedule: 'sync' });
      count.set(5);
      expect(state?.value).toBe(5);
    });
    scope.stop();
  });

  it('supports microtask schedule in ioRef', async () => {
    const scope = effectScope();
    let ref: Ref<number> | undefined;
    scope.run(() => {
      const count = io(0);
      ref = ioRef(count, { schedule: 'microtask' });
      count.set(7);
      expect(ref?.value).toBe(0);
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(ref?.value).toBe(7);
    scope.stop();
  });

  it('drops queued microtask updates after scope dispose', async () => {
    const scope = effectScope();
    let state: ShallowRef<number> | undefined;
    let countRef: { get(): number } | undefined;

    scope.run(() => {
      const count = io(0);
      countRef = count;
      state = useIO(count, { schedule: 'microtask' });
      count.set(1);
      expect(state?.value).toBe(0);
    });
    scope.stop();
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(countRef?.get()).toBe(1);
    expect(state?.value).toBe(0);
  });

  it('works in SSR-like environment without window/document', () => {
    const ioGlobal = globalThis as unknown as {
      window?: unknown;
      document?: unknown;
    };
    const previousWindow = ioGlobal.window;
    const previousDocument = ioGlobal.document;
    delete ioGlobal.window;
    delete ioGlobal.document;

    const scope = effectScope();
    let state: ShallowRef<number> | undefined;
    scope.run(() => {
      const count = io(1);
      state = useIO(count, { schedule: 'sync' });
      count.set(2);
    });
    scope.stop();

    expect(state?.value).toBe(2);
    ioGlobal.window = previousWindow;
    ioGlobal.document = previousDocument;
  });

  it('skips selector updates when selected value is unchanged', () => {
    const scope = effectScope();
    let selected: ShallowRef<number> | undefined;

    scope.run(() => {
      const store = io({ count: 0, label: 'a' });
      selected = useIOSelector(store, (state) => state.count, {
        schedule: 'sync',
      });
      expect(selected?.value).toBe(0);
      store.label.set('b');
      expect(selected?.value).toBe(0);
      store.count.set(1);
      expect(selected?.value).toBe(1);
    });

    scope.stop();
  });

  it('supports custom selector equality', () => {
    const scope = effectScope();
    let selected: ShallowRef<number[]> | undefined;

    scope.run(() => {
      const store = io({ values: [1, 2] });
      selected = useIOSelector(
        store,
        (state) => [...state.values],
        {
          schedule: 'sync',
          isEqual: (prev, next) =>
            prev.length === next.length &&
            prev.every((value, index) => value === next[index]),
        },
      );
      const first = selected?.value;
      store.values.set([1, 2]);
      expect(selected?.value).toBe(first);
      store.values.set([1, 2, 3]);
      expect(selected?.value).not.toBe(first);
    });

    scope.stop();
  });
});
