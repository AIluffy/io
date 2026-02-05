import React from 'react';
import TestRenderer from 'react-test-renderer';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { oin } from '@oin/store';

import { useOin } from './index.js';

async function setup(schedule: 'sync' | 'microtask') {
  const count = oin(0);
  const renders: number[] = [];

  const App = () => {
    const value = useOin(count, { schedule });
    renders.push(value);
    return React.createElement('span', null, String(value));
  };

  let renderer: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(App));
  });

  const getText = () => {
    const json = renderer.toJSON() as { children?: string[] } | null;
    return json?.children?.[0] ?? '';
  };

  return { count, renders, getText };
}

describe('@oin/react', () => {
  it('batches microtask updates and skips intermediate renders', async () => {
    const { count, renders, getText } = await setup('microtask');

    act(() => {
      count(1);
      count(2);
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
      count(1);
    });
    act(() => {
      count(2);
    });

    expect(getText()).toBe('2');
    expect(renders).toContain(1);
  });
});
