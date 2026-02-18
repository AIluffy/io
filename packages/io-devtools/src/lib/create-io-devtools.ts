import { onError } from '@iostore/store/debug';
import { getLinkInfo } from '@iostore/store/extensions';
import { applyUpdate, undoUpdate } from '@iostore/store/patches';
import type { IoPatch, IoUpdate } from '@iostore/store/patches';
import { diffSnapshots } from './diff-snapshots.js';
import { createReduxBridgeConnector } from './devtools/bridge.js';
import { createHistoryController } from './devtools/history.js';
import { createPerfTracker } from './devtools/perf.js';
import { exportReduxDevToolsImportState } from './export-redux-devtools.js';
import { sanitizeForJson } from './sanitize.js';
import type {
  IoDevtools,
  IoDevtoolsEvent,
  IoErrorHandler,
  IoDevtoolsOptions,
  IoDevtoolsState,
  IoDevtoolsTarget,
  IoPatchDiff,
} from './types.js';

function nowEpochMs(): number {
  return Date.now();
}

function nowPerfMs(): number {
  return globalThis.performance?.now
    ? globalThis.performance.now()
    : Date.now();
}

function createIdFactory(prefix: string) {
  let seq = 0;
  return () => {
    seq += 1;
    const rand = globalThis.crypto?.randomUUID?.();
    return rand ? `${prefix}-${rand}` : `${prefix}-${seq}`;
  };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asTarget(target: unknown): IoDevtoolsTarget {
  const t = target as Partial<IoDevtoolsTarget>;
  if (
    typeof t?.snapshot !== 'function' ||
    typeof t?.subscribeUpdate !== 'function'
  ) {
    throw new Error(
      'createIoDevtools: target must implement snapshot() and subscribeUpdate()',
    );
  }
  return target as IoDevtoolsTarget;
}

function patchToDiff(patch: IoPatch): IoPatchDiff {
  if (patch.op === 'set')
    return { op: 'set', path: patch.path, prev: patch.prev, next: patch.next };
  if (patch.op === 'splice')
    return {
      op: 'splice',
      path: patch.path,
      start: patch.start,
      deleteCount: patch.deleteCount,
      deleted: patch.deleted,
      items: patch.items,
    };
  return { op: 'sort', path: patch.path, order: patch.order };
}

export function createIoDevtools(
  targetInput: unknown,
  options?: IoDevtoolsOptions,
): IoDevtools {
  const target = asTarget(targetInput);
  const createId = createIdFactory(options?.name ?? 'io');

  let enabled = options?.enabled ?? true;
  let paused = false;
  const errors: unknown[] = [];
  const listeners = new Set<(event: IoDevtoolsEvent) => void>();
  let isTimeTraveling = false;

  const perfEnabled = options?.perf?.enabled ?? true;
  const perfWindowSize = clampInt(options?.perf?.windowSize ?? 60, 1, 5_000);
  const perfSampleRate = Math.max(
    0,
    Math.min(1, options?.perf?.sampleRate ?? 1),
  );

  const snapshotStrategy = options?.captureSnapshots ?? 'always';
  const maxHistory = clampInt(options?.maxHistory ?? 10_000, 1, 10_000);

  const emit = (event: IoDevtoolsEvent) => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        options?.onDevtoolsError?.(error);
      }
    }
  };

  function getState(): IoDevtoolsState {
    let links: ReturnType<typeof getLinkInfo> | undefined;
    try {
      links = getLinkInfo(target);
    } catch (error) {
      options?.onDevtoolsError?.(error);
      links = undefined;
    }
    return {
      enabled,
      paused,
      cursor: historyController.getCursor(),
      history: historyController.history,
      errors,
      links,
      perf: perfTracker.getState(),
    };
  }

  const reportDevtoolsError = (
    error: unknown,
    source: 'devtools' | 'bridge',
  ) => {
    errors.push(error);
    emit({ type: 'error', source, error, state: getState() });
    options?.onDevtoolsError?.(error);
  };

  const perfTracker = createPerfTracker({
    enabled: perfEnabled,
    windowSize: perfWindowSize,
    sampleRate: perfSampleRate,
    emit,
    getState,
  });

  const historyController = createHistoryController({
    target,
    options,
    emit,
    getState,
    createId,
    perfTracker,
    snapshotStrategy,
    maxHistory,
    nowEpochMs,
    nowPerfMs,
    diffSnapshots,
    patchToDiff,
    sanitizeForJson,
    exportReduxDevToolsImportState,
  });

  const onUpdate = (update: IoUpdate) => {
    if (!enabled || paused || isTimeTraveling) return;
    try {
      historyController.appendHistory(update);
    } catch (error) {
      reportDevtoolsError(error, 'devtools');
    }
  };

  const errorHandler: IoErrorHandler = (error, path, operation) => {
    if (!enabled) return;
    errors.push(error);
    emit({
      type: 'error',
      source: 'io',
      error,
      path,
      operation,
      state: getState(),
    });
  };

  const unsubscribeUpdate = target.subscribeUpdate(onUpdate);
  const unsubscribeError = onError(targetInput, errorHandler);

  const initialSnapshot = target.snapshot();
  historyController.setInitialSnapshot(initialSnapshot);
  historyController.setLastSnapshot(initialSnapshot);

  const withTimeTraveling = <T>(fn: () => T): T => {
    isTimeTraveling = true;
    try {
      return fn();
    } finally {
      isTimeTraveling = false;
    }
  };

  const applyTimeTravel = (
    update: IoUpdate,
    kind: 'undo' | 'redo',
  ): boolean => {
    const from = historyController.getCursor();
    return withTimeTraveling(() => {
      try {
        applyUpdate(targetInput, update, { emitUpdate: false });
        const to = kind === 'undo' ? from - 1 : from + 1;
        const next = clampInt(to, -1, historyController.history.length - 1);
        historyController.setCursor(next);
        emit({
          type: 'timeTravel',
          kind,
          from,
          to: historyController.getCursor(),
          state: getState(),
        });
        return true;
      } catch (error) {
        reportDevtoolsError(error, 'devtools');
        return false;
      }
    });
  };

  const undo = (): boolean => {
    const cursor = historyController.getCursor();
    if (cursor < 0) return false;
    const entry = historyController.history[cursor];
    return applyTimeTravel(undoUpdate(entry.update), 'undo');
  };

  const redo = (): boolean => {
    const cursor = historyController.getCursor();
    if (cursor >= historyController.history.length - 1) return false;
    const entry = historyController.history[cursor + 1];
    return applyTimeTravel(entry.update, 'redo');
  };

  const goTo = (index: number): boolean => {
    const to = clampInt(index, -1, historyController.history.length - 1);
    const from = historyController.getCursor();
    if (to === from) return true;
    const step = () => (historyController.getCursor() > to ? undo() : redo());
    while (historyController.getCursor() !== to) {
      if (!step()) return false;
    }
    emit({
      type: 'timeTravel',
      kind: 'goTo',
      from,
      to: historyController.getCursor(),
      state: getState(),
    });
    return true;
  };

  const clear = () => {
    const from = historyController.getCursor();
    const snapshot = target.snapshot();
    historyController.clearHistory();
    historyController.setInitialSnapshot(snapshot);
    historyController.setLastSnapshot(snapshot);
    emit({
      type: 'timeTravel',
      kind: 'clear',
      from,
      to: historyController.getCursor(),
      state: getState(),
    });
  };

  const connectReduxDevToolsExtension = createReduxBridgeConnector({
    target,
    options,
    listeners,
    emit,
    getState,
    reportDevtoolsError,
    history: historyController.history,
    clearHistory: historyController.clearHistory,
    resetSnapshots: (next) => {
      historyController.setInitialSnapshot(next);
      historyController.setLastSnapshot(next);
    },
    goTo,
    withTimeTraveling,
    sanitizeForJson,
  });

  const devtools: IoDevtools = {
    getState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setEnabled: (next) => {
      enabled = next;
    },
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    destroy: () => {
      unsubscribeUpdate();
      unsubscribeError();
      listeners.clear();
    },
    clear,
    timeTravel: { undo, redo, goTo },
    export: {
      json: historyController.exportJson,
      reduxDevToolsImport: historyController.exportReduxImport,
    },
    connectReduxDevToolsExtension,
  };

  return devtools;
}
