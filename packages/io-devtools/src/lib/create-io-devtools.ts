import { applyUpdate, getLinkInfo, onError, undoUpdate } from 'io-store';
import type { IoPatch, IoUpdate } from 'io-store';
import { diffSnapshots } from './diff-snapshots.js';
import { exportReduxDevToolsImportState } from './export-redux-devtools.js';
import { sanitizeForJson } from './sanitize.js';
import type {
  IoDevtools,
  IoDevtoolsBridge,
  IoDevtoolsEvent,
  IoErrorHandler,
  IoDevtoolsOptions,
  IoDevtoolsPerfSample,
  IoDevtoolsPerfSummary,
  IoDevtoolsState,
  IoDevtoolsTarget,
  IoHistoryEntry,
  IoPatchDiff,
  ReduxDevToolsImportState,
  Unsubscribe,
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

function defaultPerfSummary(windowSize: number): IoDevtoolsPerfSummary {
  return {
    windowSize,
    avgTotalMs: 0,
    maxTotalMs: 0,
    avgSnapshotMs: 0,
    maxSnapshotMs: 0,
    avgDiffMs: 0,
    maxDiffMs: 0,
  };
}

function computePerfSummary(
  recent: ReadonlyArray<IoDevtoolsPerfSample>,
  windowSize: number
): IoDevtoolsPerfSummary {
  if (recent.length === 0) return defaultPerfSummary(windowSize);
  let totalSum = 0;
  let totalMax = 0;
  let snapSum = 0;
  let snapMax = 0;
  let diffSum = 0;
  let diffMax = 0;
  let snapCount = 0;
  let diffCount = 0;

  for (const s of recent) {
    totalSum += s.totalMs;
    totalMax = Math.max(totalMax, s.totalMs);
    if (typeof s.snapshotMs === 'number') {
      snapSum += s.snapshotMs;
      snapMax = Math.max(snapMax, s.snapshotMs);
      snapCount += 1;
    }
    if (typeof s.diffMs === 'number') {
      diffSum += s.diffMs;
      diffMax = Math.max(diffMax, s.diffMs);
      diffCount += 1;
    }
  }

  return {
    windowSize,
    avgTotalMs: totalSum / recent.length,
    maxTotalMs: totalMax,
    avgSnapshotMs: snapCount ? snapSum / snapCount : undefined,
    maxSnapshotMs: snapCount ? snapMax : undefined,
    avgDiffMs: diffCount ? diffSum / diffCount : undefined,
    maxDiffMs: diffCount ? diffMax : undefined,
  };
}

function asTarget(target: unknown): IoDevtoolsTarget {
  const t = target as Partial<IoDevtoolsTarget>;
  if (
    typeof t?.snapshot !== 'function' ||
    typeof t?.subscribeUpdate !== 'function'
  ) {
    throw new Error(
      'createIoDevtools: target must implement snapshot() and subscribeUpdate()'
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

type ReduxExtension = {
  connect: (options: { name: string }) => {
    init: (state: unknown) => void;
    send: (action: { type: string }, state: unknown) => void;
    subscribe: (fn: (message: unknown) => void) => void;
    unsubscribe: () => void;
  };
};

function getReduxExtension(win: unknown): ReduxExtension | null {
  const w = win as Record<string, unknown> | null | undefined;
  const ext = w?.__REDUX_DEVTOOLS_EXTENSION__ as unknown;
  if (!ext) return null;
  if (typeof (ext as ReduxExtension).connect !== 'function') return null;
  return ext as ReduxExtension;
}

export function createIoDevtools(
  targetInput: unknown,
  options?: IoDevtoolsOptions
): IoDevtools {
  const target = asTarget(targetInput);
  const createId = createIdFactory(options?.name ?? 'io');

  let enabled = options?.enabled ?? true;
  let paused = false;
  let cursor = -1;
  let lastEpochMs = nowEpochMs();
  let lastSnapshot: unknown | undefined;
  let initialSnapshot: unknown;
  const history: IoHistoryEntry[] = [];
  const errors: unknown[] = [];
  const listeners = new Set<(event: IoDevtoolsEvent) => void>();
  let isTimeTraveling = false;

  const perfEnabled = options?.perf?.enabled ?? true;
  const perfWindowSize = clampInt(options?.perf?.windowSize ?? 60, 1, 5_000);
  const perfSampleRate = Math.max(
    0,
    Math.min(1, options?.perf?.sampleRate ?? 1)
  );
  const perfRecent: IoDevtoolsPerfSample[] = [];

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

  const getState = (): IoDevtoolsState => {
    const summary = computePerfSummary(perfRecent, perfWindowSize);
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
      cursor,
      history,
      errors,
      links,
      perf: perfEnabled
        ? {
            recent: perfRecent,
            summary,
          }
        : undefined,
    };
  };

  const reportDevtoolsError = (
    error: unknown,
    source: 'devtools' | 'bridge'
  ) => {
    errors.push(error);
    emit({ type: 'error', source, error, state: getState() });
    options?.onDevtoolsError?.(error);
  };

  const pushPerf = (sample: IoDevtoolsPerfSample) => {
    if (!perfEnabled) return;
    if (perfSampleRate < 1 && Math.random() > perfSampleRate) return;
    perfRecent.push(sample);
    while (perfRecent.length > perfWindowSize) perfRecent.shift();
    const summary = computePerfSummary(perfRecent, perfWindowSize);
    emit({ type: 'perf', sample, summary, state: getState() });
  };

  const maybeCaptureSnapshot = (): { snapshot?: unknown; ms?: number } => {
    if (snapshotStrategy === 'never') return {};
    const t0 = nowPerfMs();
    const snapshot = target.snapshot();
    const t1 = nowPerfMs();
    return { snapshot, ms: t1 - t0 };
  };

  const appendHistory = (update: IoUpdate) => {
    const epoch = nowEpochMs();
    const intervalMs = epoch - lastEpochMs;
    lastEpochMs = epoch;

    const t0 = nowPerfMs();

    if (cursor < history.length - 1) history.splice(cursor + 1);

    const snapshotBefore =
      snapshotStrategy === 'always' ? lastSnapshot : undefined;

    const beforeInfo =
      snapshotStrategy === 'always' ? { snapshot: snapshotBefore } : undefined;
    const afterInfo = maybeCaptureSnapshot();

    const patches = options?.filterPatch
      ? update.patches.filter((p) => options.filterPatch?.(p, update))
      : update.patches;

    const patchDiffs = patches.map(patchToDiff);

    let diffMs: number | undefined;
    if (
      snapshotStrategy === 'always' &&
      beforeInfo?.snapshot !== undefined &&
      afterInfo.snapshot !== undefined
    ) {
      const d0 = nowPerfMs();
      diffSnapshots(beforeInfo.snapshot, afterInfo.snapshot, { maxChanges: 1 });
      const d1 = nowPerfMs();
      diffMs = d1 - d0;
    }

    const t1 = nowPerfMs();

    const entry: IoHistoryEntry = {
      id: createId(),
      timestamp: epoch,
      update,
      patchDiffs,
      snapshotBefore:
        snapshotStrategy === 'always' ? snapshotBefore : undefined,
      snapshotAfter:
        snapshotStrategy === 'always' ? afterInfo.snapshot : undefined,
      perf: perfEnabled
        ? {
            patchCount: update.patches.length,
            intervalMs,
            snapshotMs: afterInfo.ms,
            diffMs,
            totalMs: t1 - t0,
          }
        : undefined,
    };

    history.push(entry);
    while (history.length > maxHistory) {
      history.shift();
      cursor -= 1;
    }

    cursor = history.length - 1;
    lastSnapshot = entry.snapshotAfter ?? lastSnapshot;

    if (entry.perf) pushPerf(entry.perf);
    emit({ type: 'mutation', entry, state: getState() });
  };

  const onUpdate = (update: IoUpdate) => {
    if (!enabled || paused || isTimeTraveling) return;
    try {
      appendHistory(update);
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

  const initInfo = maybeCaptureSnapshot();
  initialSnapshot = initInfo.snapshot ?? target.snapshot();
  lastSnapshot = initialSnapshot;

  const applyTimeTravel = (
    update: IoUpdate,
    kind: 'undo' | 'redo'
  ): boolean => {
    const from = cursor;
    isTimeTraveling = true;
    try {
      applyUpdate(targetInput, update, { emitUpdate: false });
      const to = kind === 'undo' ? cursor - 1 : cursor + 1;
      cursor = clampInt(to, -1, history.length - 1);
      emit({ type: 'timeTravel', kind, from, to: cursor, state: getState() });
      return true;
    } catch (error) {
      reportDevtoolsError(error, 'devtools');
      return false;
    } finally {
      isTimeTraveling = false;
    }
  };

  const undo = (): boolean => {
    if (cursor < 0) return false;
    const entry = history[cursor];
    return applyTimeTravel(undoUpdate(entry.update), 'undo');
  };

  const redo = (): boolean => {
    if (cursor >= history.length - 1) return false;
    const entry = history[cursor + 1];
    return applyTimeTravel(entry.update, 'redo');
  };

  const goTo = (index: number): boolean => {
    const to = clampInt(index, -1, history.length - 1);
    const from = cursor;
    if (to === from) return true;
    const step = () => (cursor > to ? undo() : redo());
    while (cursor !== to) {
      if (!step()) return false;
    }
    emit({
      type: 'timeTravel',
      kind: 'goTo',
      from,
      to: cursor,
      state: getState(),
    });
    return true;
  };

  const clear = () => {
    const from = cursor;
    history.length = 0;
    cursor = -1;
    emit({
      type: 'timeTravel',
      kind: 'clear',
      from,
      to: cursor,
      state: getState(),
    });
  };

  const exportJson = (): string => {
    const payload = {
      name: options?.name ?? 'IO',
      initialSnapshot: sanitizeForJson(initialSnapshot, options?.export),
      cursor,
      history: history.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        update: e.update,
        patchDiffs: e.patchDiffs,
        snapshotBefore:
          snapshotStrategy === 'always'
            ? sanitizeForJson(e.snapshotBefore, options?.export)
            : undefined,
        snapshotAfter:
          snapshotStrategy === 'always'
            ? sanitizeForJson(e.snapshotAfter, options?.export)
            : undefined,
        perf: e.perf,
      })),
    };
    return JSON.stringify(payload, null, 2);
  };

  const exportReduxImport = (): ReduxDevToolsImportState => {
    if (snapshotStrategy !== 'always') {
      throw new Error(
        'devtools.export.reduxDevToolsImport requires captureSnapshots="always"'
      );
    }
    return exportReduxDevToolsImportState({
      initialState: sanitizeForJson(initialSnapshot, options?.export),
      history: history.map((e) => ({
        ...e,
        snapshotAfter: sanitizeForJson(e.snapshotAfter, options?.export),
      })),
      cursor,
    });
  };

  const connectReduxDevToolsExtension = (bridgeOptions?: {
    window?: unknown;
    name?: string;
  }): IoDevtoolsBridge | null => {
    const enabledByConfig = options?.reduxDevTools?.enabled ?? false;
    if (!enabledByConfig) return null;
    const win = bridgeOptions?.window ?? (globalThis as unknown);
    const ext = getReduxExtension(win);
    if (!ext) return null;
    const name =
      bridgeOptions?.name ??
      options?.reduxDevTools?.name ??
      options?.name ??
      'IO';

    const connection = ext.connect({ name });
    connection.init(sanitizeForJson(target.snapshot(), options?.export));

    const onBridgeUpdate = (event: IoDevtoolsEvent) => {
      if (event.type !== 'mutation') return;
      const index = history.length - 1;
      const actionType = `IO/${index + 1}`;
      const state = sanitizeForJson(target.snapshot(), options?.export);
      try {
        connection.send({ type: actionType }, state);
      } catch (error) {
        reportDevtoolsError(error, 'bridge');
      }
    };

    const unsub = ((): Unsubscribe => {
      const fn = (event: IoDevtoolsEvent) => onBridgeUpdate(event);
      listeners.add(fn);
      return () => listeners.delete(fn);
    })();

    const handleMessage = (message: unknown) => {
      const m = message as {
        type?: unknown;
        payload?: unknown;
        state?: unknown;
      };
      if (m?.type !== 'DISPATCH') return;
      const payload = m.payload as
        | { type?: unknown; actionId?: unknown }
        | undefined;
      const dispatchType = payload?.type;
      if (dispatchType === 'RESET') {
        clear();
        connection.init(sanitizeForJson(target.snapshot(), options?.export));
        return;
      }
      if (dispatchType === 'COMMIT') {
        clear();
        initialSnapshot = target.snapshot();
        lastSnapshot = initialSnapshot;
        connection.init(sanitizeForJson(initialSnapshot, options?.export));
        return;
      }
      if (
        dispatchType === 'JUMP_TO_ACTION' ||
        dispatchType === 'JUMP_TO_STATE'
      ) {
        const actionIdRaw = payload?.actionId;
        const actionId =
          typeof actionIdRaw === 'number'
            ? actionIdRaw
            : typeof actionIdRaw === 'string'
            ? Number(actionIdRaw)
            : NaN;
        if (!Number.isFinite(actionId)) return;
        const nextIndex = actionId - 1;
        isTimeTraveling = true;
        try {
          goTo(nextIndex);
        } finally {
          isTimeTraveling = false;
        }
      }
    };

    connection.subscribe(handleMessage);

    emit({ type: 'bridge', connected: true, state: getState() });

    const bridge: IoDevtoolsBridge = {
      disconnect: () => {
        try {
          unsub();
          connection.unsubscribe();
        } catch (error) {
          reportDevtoolsError(error, 'bridge');
        } finally {
          emit({ type: 'bridge', connected: false, state: getState() });
        }
      },
    };
    return bridge;
  };

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
      json: exportJson,
      reduxDevToolsImport: exportReduxImport,
    },
    connectReduxDevToolsExtension,
  };

  return devtools;
}
