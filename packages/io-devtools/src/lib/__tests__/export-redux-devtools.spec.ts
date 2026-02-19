import { describe, expect, it } from 'vitest';
import { exportReduxDevToolsImportState } from '../export-redux-devtools.js';
import type { IoHistoryEntry } from '../types.js';

const entry: IoHistoryEntry = {
  id: 'u1',
  timestamp: 0,
  update: {
    id: 'u1',
    baseRevision: 0,
    revision: 1,
    patches: [],
    action: 'counter/increment',
  },
  patchDiffs: [
    {
      op: 'set',
      path: [Symbol.for('k')],
      prev: 1,
      next: 2,
    },
  ],
  snapshotAfter: { value: 2 },
};

describe('@iostore/devtools: exportReduxDevToolsImportState', () => {
  it('builds actions and computed states', () => {
    const payload = exportReduxDevToolsImportState({
      initialState: { value: 1 },
      history: [entry],
      cursor: 0,
    });

    expect(payload.computedStates).toHaveLength(2);
    expect(payload.currentStateIndex).toBe(1);
    expect(payload.actionsById['1'].type).toBe('counter/increment');
  });

  it('falls back to patch summary when update.action is missing', () => {
    const payload = exportReduxDevToolsImportState({
      initialState: { value: 1 },
      history: [{ ...entry, update: { ...entry.update, action: undefined } }],
      cursor: 0,
    });

    expect(payload.actionsById['1'].type).toMatch(/IO_SET/);
    expect(payload.actionsById['1'].type).toMatch(/Symbol/);
  });
});
