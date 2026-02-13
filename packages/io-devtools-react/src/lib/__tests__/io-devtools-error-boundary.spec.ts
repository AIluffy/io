import { describe, expect, it } from 'vitest';
import { IoDevtoolsErrorBoundary } from '../io-devtools-error-boundary.js';

describe('@iostore/devtools-react: IoDevtoolsErrorBoundary', () => {
  it('derives state from error', () => {
    const state = IoDevtoolsErrorBoundary.getDerivedStateFromError(new Error('x'));
    expect(state.error).toBeInstanceOf(Error);
  });
});
