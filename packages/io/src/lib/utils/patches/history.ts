import type { IoHistory, IoHistoryOptions, IoUpdate } from '../types/types.js';

import { applyUpdate, undoUpdate } from './updates.js';

type Subscribable = {
  subscribeUpdate: (fn: (u: IoUpdate) => void) => () => void;
};

type HistoryEntry = {
  update: IoUpdate;
  groupId: number;
  groupKey: PropertyKey | undefined;
};

function shouldRecordByStrategy(
  update: IoUpdate,
  strategy: IoHistoryOptions['filter'],
): boolean {
  if (!strategy || strategy === 'all') {
    return true;
  }
  if (strategy === 'exclude-undo-redo') {
    return update.action !== 'undo' && update.action !== 'redo';
  }
  return strategy(update);
}

export function createHistory(
  target: unknown,
  options?: IoHistoryOptions,
): IoHistory {
  const limit = options?.limit ?? Infinity;
  const emitUpdate = options?.emitUpdate ?? true;
  const filter = options?.filter ?? 'exclude-undo-redo';
  const groupBy = options?.groupBy;

  let entries: HistoryEntry[] = [];
  let cursor = -1;
  let destroyed = false;
  let isApplying = false;
  let pendingCheckpoint = false;
  let nextGroupId = 1;

  const subscribe = (target as Subscribable).subscribeUpdate;
  if (typeof subscribe !== 'function')
    throw new Error('createHistory: target is not an IO node');

  const stop = subscribe((update) => {
    if (destroyed || isApplying) return;
    if (limit <= 0) return;
    if (!shouldRecordByStrategy(update, filter)) return;

    if (cursor + 1 < entries.length) {
      entries = entries.slice(0, cursor + 1);
    }

    const groupKey = groupBy?.(update);
    const previous = entries[entries.length - 1];
    const shouldMergeWithPrevious =
      !pendingCheckpoint &&
      previous !== undefined &&
      groupBy !== undefined &&
      groupKey !== undefined &&
      previous.groupKey !== undefined &&
      Object.is(groupKey, previous.groupKey);

    const groupId = shouldMergeWithPrevious ? previous.groupId : nextGroupId++;
    entries.push({
      update,
      groupId,
      groupKey,
    });
    pendingCheckpoint = false;

    if (entries.length > limit) {
      const overflow = entries.length - limit;
      entries.splice(0, overflow);
      cursor -= overflow;
      if (cursor < -1) cursor = -1;
    }

    cursor = entries.length - 1;
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
    const entry = entries[cursor];
    apply(undoUpdate(entry.update));
    cursor -= 1;
  };

  const undoGroup = () => {
    if (cursor < 0) return;
    const groupId = entries[cursor].groupId;
    while (cursor >= 0 && entries[cursor].groupId === groupId) {
      const entry = entries[cursor];
      apply(undoUpdate(entry.update));
      cursor -= 1;
    }
  };

  const redo = () => {
    if (cursor + 1 >= entries.length) return;
    const entry = entries[cursor + 1];
    apply(entry.update);
    cursor += 1;
  };

  const redoGroup = () => {
    if (cursor + 1 >= entries.length) return;
    const groupId = entries[cursor + 1].groupId;
    while (cursor + 1 < entries.length && entries[cursor + 1].groupId === groupId) {
      const entry = entries[cursor + 1];
      apply(entry.update);
      cursor += 1;
    }
  };

  const checkpoint = () => {
    pendingCheckpoint = true;
  };

  const clear = () => {
    entries = [];
    cursor = -1;
    pendingCheckpoint = false;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stop();
    clear();
  };

  return {
    undo,
    undoGroup,
    redo,
    redoGroup,
    checkpoint,
    clear,
    destroy,
    get canUndo() {
      return cursor >= 0;
    },
    get canRedo() {
      return cursor + 1 < entries.length;
    },
    get length() {
      return entries.length;
    },
    get cursor() {
      return cursor;
    },
  };
}
