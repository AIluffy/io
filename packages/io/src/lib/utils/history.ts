import type { IoHistory, IoHistoryOptions, IoUpdate } from './types.js';

import { applyUpdate, undoUpdate } from './updates.js';

type Subscribable = {
  subscribeUpdate: (fn: (u: IoUpdate) => void) => () => void;
};

export function createHistory(
  target: unknown,
  options?: IoHistoryOptions,
): IoHistory {
  const limit = options?.limit ?? Infinity;
  const emitUpdate = options?.emitUpdate ?? true;

  let updates: IoUpdate[] = [];
  let cursor = -1;
  let destroyed = false;
  let isApplying = false;

  const subscribe = (target as Subscribable).subscribeUpdate;
  if (typeof subscribe !== 'function')
    throw new Error('createHistory: target is not an IO node');

  const stop = subscribe((update) => {
    if (destroyed || isApplying) return;
    if (limit <= 0) return;

    if (cursor + 1 < updates.length) {
      updates = updates.slice(0, cursor + 1);
    }

    updates.push(update);

    if (updates.length > limit) {
      const overflow = updates.length - limit;
      updates.splice(0, overflow);
      cursor -= overflow;
      if (cursor < -1) cursor = -1;
    }

    cursor = updates.length - 1;
  });

  const apply = (update: IoUpdate) => {
    isApplying = true;
    try {
      applyUpdate(target, update, { emitUpdate });
    } finally {
      isApplying = false;
    }
  };

  const undo = () => {
    if (cursor < 0) return;
    const update = updates[cursor];
    apply(undoUpdate(update));
    cursor -= 1;
  };

  const redo = () => {
    if (cursor + 1 >= updates.length) return;
    const update = updates[cursor + 1];
    apply(update);
    cursor += 1;
  };

  const clear = () => {
    updates = [];
    cursor = -1;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stop();
    clear();
  };

  return {
    undo,
    redo,
    clear,
    destroy,
    get canUndo() {
      return cursor >= 0;
    },
    get canRedo() {
      return cursor + 1 < updates.length;
    },
    get length() {
      return updates.length;
    },
    get cursor() {
      return cursor;
    },
  };
}
