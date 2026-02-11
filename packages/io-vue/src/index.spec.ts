import { describe, expect, it } from 'vitest';
import type { Ref, ShallowRef } from 'vue';
import { effectScope } from 'vue';
import { io } from 'io-store';
import { ioRef, useIO } from './index.js';

describe('@org/io-vue', () => {
  it('exports adapters', () => {
    expect(typeof useIO).toBe('function');
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
});
