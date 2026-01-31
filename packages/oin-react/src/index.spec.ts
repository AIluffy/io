import { describe, expect, it } from 'vitest';
import { useOin } from './index.js';

describe('@org/oin-react', () => {
  it('exports useOin', () => {
    expect(typeof useOin).toBe('function');
  });
});
