import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { io } from '@iostore/store';
import { createIoDevtools } from '@iostore/devtools';
import { IoDevtoolsPanel } from '../io-devtools-panel.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('@iostore/devtools-react: IoDevtoolsPanel', () => {
  it('renders controls and reacts to history updates', () => {
    const store = io({ count: 0 });
    const devtools = createIoDevtools(store, { captureSnapshots: 'always' });

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      const panel = React.createElement(IoDevtoolsPanel, {
        devtools,
        height: 300,
      }) as unknown as React.ReactElement;
      renderer = (TestRenderer.create as (
        element: unknown,
      ) => TestRenderer.ReactTestRenderer)(panel);
    });
    if (!renderer) throw new Error('Renderer did not mount');
    const mountedRenderer = renderer;
    try {
      const getButton = (label: string) =>
        mountedRenderer
          .root
          .findAllByType('button')
          .find((b) => b.props.children === label);

      expect(getButton('Undo')?.props.disabled).toBe(true);
      expect(getButton('Pause')?.props.disabled).toBeUndefined();
      expect(getButton('Clear')?.props.disabled).toBe(true);

      act(() => {
        store.count.set(1);
      });

      expect(getButton('Clear')?.props.disabled).toBe(false);
    } finally {
      act(() => {
        mountedRenderer.unmount();
      });
      devtools.destroy();
    }
  });
});
