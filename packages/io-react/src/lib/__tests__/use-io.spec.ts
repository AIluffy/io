import React from 'react';
import TestRenderer from 'react-test-renderer';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { io } from '@iostore/store';
import { schedule, withBehaviors } from '@iostore/store/behavior';

import { useIO, useIOSelector } from '../use-io.js';

const createRenderer = (element: unknown): TestRenderer.ReactTestRenderer =>
  TestRenderer.create(element as never);

async function setup(schedule: 'sync' | 'microtask') {
  const count = io(0);
  const renders: number[] = [];

  const App = () => {
    const value = useIO(count, { schedule });
    renders.push(value);
    return React.createElement('span', null, String(value));
  };

  let renderer: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = createRenderer(
      React.createElement(App),
    );
  });

  const getText = () => {
    const json = renderer.toJSON() as { children?: string[] } | null;
    return json?.children?.[0] ?? '';
  };

  return { count, renders, getText };
}

describe('@iostore/react', () => {
  it('batches microtask updates and skips intermediate renders', async () => {
    const { count, renders, getText } = await setup('microtask');

    act(() => {
      count.set(1);
      count.set(2);
    });

    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    });

    expect(getText()).toBe('2');
    expect(renders[0]).toBe(0);
    expect(renders).not.toContain(1);
  });

  it('sync schedule emits each update', async () => {
    const { count, renders, getText } = await setup('sync');

    act(() => {
      count.set(1);
    });
    act(() => {
      count.set(2);
    });

    expect(getText()).toBe('2');
    expect(renders).toContain(1);
  });

  it('does not flush stale microtask notifications after unmount', async () => {
    const count = io(0);
    const renders: number[] = [];

    const App = () => {
      const value = useIO(count, { schedule: 'microtask' });
      renders.push(value);
      return React.createElement('span', null, String(value));
    };

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(
        React.createElement(App),
      );
    });

    act(() => {
      count.set(1);
    });
    await act(async () => {
      renderer.unmount();
    });
    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    });

    expect(renders).toEqual([0]);
  });

  it('supports behavior views as useIO source', async () => {
    const count = io(0);
    const view = withBehaviors(count, [schedule('sync')]);
    const renders: number[] = [];

    const App = () => {
      const value = useIO(view, { schedule: 'sync' });
      renders.push(value);
      return React.createElement('span', null, String(value));
    };

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });

    act(() => {
      view.set?.(1);
    });

    expect(renders).toEqual([0, 1]);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('skips rerenders when selector result is unchanged', async () => {
    const store = io({ count: 0, other: 0 });
    const renders: number[] = [];

    const App = () => {
      const value = useIOSelector(store, (state) => state.count, {
        schedule: 'sync',
      });
      renders.push(value);
      return React.createElement('span', null, String(value));
    };

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });

    act(() => {
      store.other.set(1);
    });
    expect(renders).toEqual([0]);

    act(() => {
      store.count.set(1);
    });
    expect(renders).toEqual([0, 1]);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('supports custom selector equality', async () => {
    const store = io({ count: 0 });
    const renders: number[] = [];

    const App = () => {
      const selected = useIOSelector(
        store,
        (state) => ({ parity: state.count % 2 }),
        {
          schedule: 'sync',
          isEqual: (prev, next) => prev.parity === next.parity,
        },
      );
      renders.push(selected.parity);
      return React.createElement('span', null, String(selected.parity));
    };

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });

    act(() => {
      store.count.set(2);
    });
    expect(renders).toEqual([0]);

    act(() => {
      store.count.set(3);
    });
    expect(renders).toEqual([0, 1]);

    await act(async () => {
      renderer.unmount();
    });
  });
});
