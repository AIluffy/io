import { describe, expect, it } from 'vitest';
import { io, link } from '@iostore/store';
import { createIoDevtools } from '../create-io-devtools.js';

describe('@iostore/devtools: createIoDevtools', () => {
  it('records updates and snapshots', () => {
    const store = io({ count: 0, user: { name: 'a' } });
    const devtools = createIoDevtools(store, { captureSnapshots: 'always' });

    store.count.set(1);
    store.user.name.set('b');

    const state = devtools.getState();
    expect(state.history).toHaveLength(2);
    expect(state.cursor).toBe(1);
    expect(state.history[0].snapshotAfter).toBeDefined();
    expect(state.history[1].snapshotAfter).toBeDefined();
  });

  it('supports undo/redo', () => {
    const store = io({ count: 0, user: { name: 'a' } });
    const devtools = createIoDevtools(store, { captureSnapshots: 'always' });

    store.count.set(1);
    store.user.name.set('b');
    expect(store.snapshot()).toMatchObject({ count: 1, user: { name: 'b' } });

    devtools.timeTravel.undo();
    expect(store.snapshot()).toMatchObject({ count: 1, user: { name: 'a' } });

    devtools.timeTravel.redo();
    expect(store.snapshot()).toMatchObject({ count: 1, user: { name: 'b' } });
  });

  it('truncates future history after time-travel', () => {
    const store = io({ count: 0, user: { name: 'a' } });
    const devtools = createIoDevtools(store, { captureSnapshots: 'always' });

    store.count.set(1);
    store.user.name.set('b');
    expect(devtools.getState().history).toHaveLength(2);

    devtools.timeTravel.goTo(0);
    store.count.set(10);

    const state = devtools.getState();
    expect(state.history).toHaveLength(2);
    expect(state.cursor).toBe(1);
    expect(store.snapshot()).toMatchObject({ count: 10, user: { name: 'a' } });
  });

  it('exports JSON and Redux DevTools import state', () => {
    const store = io({ count: 0 });
    const devtools = createIoDevtools(store, { captureSnapshots: 'always' });
    store.count.set(1);

    const json = devtools.export.json();
    expect(() => JSON.parse(json)).not.toThrow();

    const redux = devtools.export.reduxDevToolsImport();
    expect(redux.computedStates.length).toBe(
      devtools.getState().history.length + 1
    );
    expect(redux.currentStateIndex).toBe(devtools.getState().cursor + 1);
  });

  it('isolates listener failures', () => {
    const store = io({ count: 0 });
    const devtools = createIoDevtools(store, { captureSnapshots: 'always' });
    devtools.subscribe(() => {
      throw new Error('listener boom');
    });

    expect(() => store.count.set(1)).not.toThrow();
    expect(devtools.getState().history).toHaveLength(1);
  });

  it('exposes multi-parent link info', () => {
    const count = io(0);
    const store = io({ a: link(count), b: link(count) });
    const devtools = createIoDevtools(store, { captureSnapshots: 'always' });

    const links = devtools.getState().links;
    expect(links?.multiParents.length).toBe(1);
    const paths = links?.multiParents[0].paths ?? [];
    expect(paths).toContainEqual(['a']);
    expect(paths).toContainEqual(['b']);
  });

  it('resets snapshot baseline when clear is called after time travel', () => {
    const store = io({ count: 0 });
    const devtools = createIoDevtools(store, { captureSnapshots: 'always' });

    store.count.set(1);
    store.count.set(2);
    devtools.timeTravel.undo();
    expect(store.count.get()).toBe(1);

    devtools.clear();
    store.count.set(3);

    const state = devtools.getState();
    expect(state.history).toHaveLength(1);
    expect(state.history[0].snapshotBefore).toMatchObject({ count: 1 });
    expect(state.history[0].snapshotAfter).toMatchObject({ count: 3 });
  });

  it('resets snapshot baseline on Redux bridge RESET after time travel', () => {
    const store = io({ count: 0 });
    let onMessage: ((message: unknown) => void) | undefined;
    const initCalls: unknown[] = [];
    const extension = {
      connect: () => ({
        init: (state: unknown) => {
          initCalls.push(state);
        },
        send: () => undefined,
        subscribe: (fn: (message: unknown) => void) => {
          onMessage = fn;
        },
        unsubscribe: () => undefined,
      }),
    };

    const devtools = createIoDevtools(store, {
      captureSnapshots: 'always',
      reduxDevTools: { enabled: true },
    });
    devtools.connectReduxDevToolsExtension({ window: { __REDUX_DEVTOOLS_EXTENSION__: extension } });

    store.count.set(1);
    store.count.set(2);
    devtools.timeTravel.undo();
    expect(store.count.get()).toBe(1);

    onMessage?.({ type: 'DISPATCH', payload: { type: 'RESET' } });
    store.count.set(4);

    const state = devtools.getState();
    expect(initCalls.length).toBeGreaterThan(0);
    expect(state.history).toHaveLength(1);
    expect(state.history[0].snapshotBefore).toMatchObject({ count: 1 });
    expect(state.history[0].snapshotAfter).toMatchObject({ count: 4 });
  });
});
