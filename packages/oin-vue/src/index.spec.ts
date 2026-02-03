import { describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import { oin } from '@oin/store';
import { oinRef, useOin } from './index.js';

describe('@org/oin-vue', () => {
  it('exports adapters', () => {
    expect(typeof useOin).toBe('function');
    expect(typeof oinRef).toBe('function');
  });

  it('supports scheduled updates', () => {
    const scope = effectScope();
    let output = 0;
    scope.run(() => {
      const count = oin(0);
      const state = useOin(count, { schedule: 'sync' });
      expect(state.value).toBe(0);
      count(2);
      output = state.value;
    });
    scope.stop();
    expect(output).toBe(2);
  });

  it('supports custom ref scheduling', () => {
    const scope = effectScope();
    let output = 0;
    scope.run(() => {
      const count = oin(0);
      const ref = oinRef(count, { schedule: 'sync' });
      expect(ref.value).toBe(0);
      count(3);
      output = ref.value;
    });
    scope.stop();
    expect(output).toBe(3);
  });

  it('respects ssr option', () => {
    const scope = effectScope();
    let output = 0;
    scope.run(() => {
      const count = oin(0);
      const state = useOin(count, { ssr: true });
      count(1);
      output = state.value;
    });
    scope.stop();
    expect(output).toBe(0);
  });
});
