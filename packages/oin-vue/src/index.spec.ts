import { describe, expect, it } from 'vitest';
import { oinRef, useOin } from './index.js';

describe('@org/oin-vue', () => {
  it('exports adapters', () => {
    expect(typeof useOin).toBe('function');
    expect(typeof oinRef).toBe('function');
  });
});

