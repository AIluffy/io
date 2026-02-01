import { describe, expect, it } from 'vitest';
import { OinDevtoolsErrorBoundary } from './oin-devtools-error-boundary.js';

describe('oin-devtools-react: OinDevtoolsErrorBoundary', () => {
  it('derives state from error', () => {
    const state = OinDevtoolsErrorBoundary.getDerivedStateFromError(new Error('x'));
    expect(state.error).toBeInstanceOf(Error);
  });
});

