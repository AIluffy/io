import { describe, expect, it } from 'vitest';
import type { Ref, ShallowRef } from 'vue';
import { effectScope } from 'vue';
import { oin } from '@oin/store';
import { oinRef, useOin } from './index.js';

describe('@org/oin-vue', () => {
  it('exports adapters', () => {
    expect(typeof useOin).toBe('function');
    expect(typeof oinRef).toBe('function');
  });

  it('supports updates', async () => {
    const scope = effectScope();
    let output = 0;
    let state: ShallowRef<number> | undefined;
    scope.run(() => {
      const count = oin(0);
      state = useOin(count);
      expect(state?.value).toBe(0);
      count(2);
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
      const count = oin(0);
      ref = oinRef(count);
      expect(ref?.value).toBe(0);
      count(3);
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    output = ref?.value ?? 0;
    scope.stop();
    expect(output).toBe(3);
  });

  it('supports sync schedule in useOin', () => {
    const scope = effectScope();
    let state: ShallowRef<number> | undefined;
    scope.run(() => {
      const count = oin(0);
      state = useOin(count, { schedule: 'sync' });
      count(5);
      expect(state?.value).toBe(5);
    });
    scope.stop();
  });

  it('supports microtask schedule in oinRef', async () => {
    const scope = effectScope();
    let ref: Ref<number> | undefined;
    scope.run(() => {
      const count = oin(0);
      ref = oinRef(count, { schedule: 'microtask' });
      count(7);
      expect(ref?.value).toBe(0);
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(ref?.value).toBe(7);
    scope.stop();
  });
});
