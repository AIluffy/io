import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { io } from 'io-store';
import { createIoDevtools } from 'io-devtools';
import { IoDevtoolsPanel } from './io-devtools-panel.js';

describe('io-devtools-react: IoDevtoolsPanel', () => {
  it('renders controls and reacts to history updates', () => {
    const store = io({ count: 0 });
    const devtools = createIoDevtools(store, { captureSnapshots: 'always' });

    const renderer = TestRenderer.create(
      React.createElement(IoDevtoolsPanel, { devtools, height: 300 }),
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
