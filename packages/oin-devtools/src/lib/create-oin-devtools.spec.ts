import { describe, expect, it } from 'vitest';
import { oin } from '@oin/store';
import { createOinDevtools } from './create-oin-devtools.js';

describe('oin-devtools: createOinDevtools', () => {
  it('records updates and snapshots', () => {
    const store = oin({ count: 0, user: { name: 'a' } });
    const devtools = createOinDevtools(store, { captureSnapshots: 'always' });

    store.count(1);
    store.user.name('b');

    const state = devtools.getState();
    expect(state.history).toHaveLength(2);
    expect(state.cursor).toBe(1);
    expect(state.history[0].snapshotAfter).toBeDefined();
    expect(state.history[1].snapshotAfter).toBeDefined();
  });

  it('supports undo/redo', () => {
    const store = oin({ count: 0, user: { name: 'a' } });
    const devtools = createOinDevtools(store, { captureSnapshots: 'always' });

    store.count(1);
    store.user.name('b');
    expect(store.snapshot()).toMatchObject({ count: 1, user: { name: 'b' } });

    devtools.timeTravel.undo();
    expect(store.snapshot()).toMatchObject({ count: 1, user: { name: 'a' } });

    devtools.timeTravel.redo();
    expect(store.snapshot()).toMatchObject({ count: 1, user: { name: 'b' } });
  });

  it('truncates future history after time-travel', () => {
    const store = oin({ count: 0, user: { name: 'a' } });
    const devtools = createOinDevtools(store, { captureSnapshots: 'always' });

    store.count(1);
    store.user.name('b');
    expect(devtools.getState().history).toHaveLength(2);

    devtools.timeTravel.goTo(0);
    store.count(10);

    const state = devtools.getState();
    expect(state.history).toHaveLength(2);
    expect(state.cursor).toBe(1);
    expect(store.snapshot()).toMatchObject({ count: 10, user: { name: 'a' } });
  });

  it('exports JSON and Redux DevTools import state', () => {
    const store = oin({ count: 0 });
    const devtools = createOinDevtools(store, { captureSnapshots: 'always' });
    store.count(1);

    const json = devtools.export.json();
    expect(() => JSON.parse(json)).not.toThrow();

    const redux = devtools.export.reduxDevToolsImport();
    expect(redux.computedStates.length).toBe(
      devtools.getState().history.length + 1
    );
    expect(redux.currentStateIndex).toBe(devtools.getState().cursor + 1);
  });

  it('isolates listener failures', () => {
    const store = oin({ count: 0 });
    const devtools = createOinDevtools(store, { captureSnapshots: 'always' });
    devtools.subscribe(() => {
      throw new Error('listener boom');
    });

    expect(() => store.count(1)).not.toThrow();
    expect(devtools.getState().history).toHaveLength(1);
  });
});
