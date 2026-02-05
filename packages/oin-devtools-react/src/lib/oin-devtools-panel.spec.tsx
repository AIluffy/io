import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { oin } from '@oin/store';
import { createOinDevtools } from '@oin/devtools';
import { OinDevtoolsPanel } from './oin-devtools-panel.js';

describe('oin-devtools-react: OinDevtoolsPanel', () => {
  it('renders controls and reacts to history updates', () => {
    const store = oin({ count: 0 });
    const devtools = createOinDevtools(store, { captureSnapshots: 'always' });

    const renderer = TestRenderer.create(
      React.createElement(OinDevtoolsPanel, { devtools, height: 300 }),
    );

    const getButton = (label: string) =>
      renderer.root
        .findAllByType('button')
        .find((b) => b.props.children === label);

    expect(getButton('Undo')?.props.disabled).toBe(true);
    expect(getButton('Pause')?.props.disabled).toBeUndefined();
    expect(getButton('Clear')?.props.disabled).toBe(true);

    act(() => {
      store.count(1);
    });

    expect(getButton('Clear')?.props.disabled).toBe(false);
  });
});
