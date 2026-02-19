import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { io } from '@iostore/store';
import { applyUpdate } from '@iostore/store/patches';
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
        applyUpdate(
          store,
          {
            id: 'manual-u1',
            baseRevision: 0,
            revision: 1,
            action: 'counter/manual',
            patches: [{ op: 'set', path: ['count'], prev: 0, next: 1 }],
          },
          { emitUpdate: true },
        );
      });

      expect(getButton('Clear')?.props.disabled).toBe(false);
      const actionLabels = mountedRenderer.root.findAll((node) => {
        if (typeof node.type !== 'string') return false;
        return node.children.some(
          (child) => typeof child === 'string' && child.includes('counter/manual'),
        );
      });
      expect(actionLabels.length).toBeGreaterThan(0);
    } finally {
      act(() => {
        mountedRenderer.unmount();
      });
      devtools.destroy();
    }
  });
});
