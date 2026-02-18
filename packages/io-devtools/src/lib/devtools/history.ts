import type { IoPatch, IoUpdate } from '@iostore/store/patches';
import type {
  IoDevtoolsEvent,
  IoDevtoolsOptions,
  IoDevtoolsSnapshotStrategy,
  IoDevtoolsState,
  IoDevtoolsTarget,
  IoHistoryEntry,
  IoPatchDiff,
  IoDevtoolsPerfSample,
  ReduxDevToolsImportState,
} from '../types.js';
import type { PerfTracker } from './perf.js';

type HistoryDeps = {
  target: IoDevtoolsTarget;
  options?: IoDevtoolsOptions;
  emit: (event: IoDevtoolsEvent) => void;
  getState: () => IoDevtoolsState;
  createId: () => string;
  perfTracker: PerfTracker;
  snapshotStrategy: IoDevtoolsSnapshotStrategy;
  maxHistory: number;
  nowEpochMs: () => number;
  nowPerfMs: () => number;
  diffSnapshots: (
    prev: unknown,
    next: unknown,
    options?: { maxChanges?: number },
  ) => unknown;
  patchToDiff: (patch: IoPatch) => IoPatchDiff;
  sanitizeForJson: (
    value: unknown,
    options?: IoDevtoolsOptions['export'],
  ) => unknown;
  exportReduxDevToolsImportState: (args: {
    initialState: unknown;
    history: ReadonlyArray<IoHistoryEntry>;
    cursor: number;
  }) => ReduxDevToolsImportState;
};

export type HistoryController = {
  history: IoHistoryEntry[];
  getCursor: () => number;
  setCursor: (next: number) => void;
  getLastSnapshot: () => unknown | undefined;
  setLastSnapshot: (next: unknown | undefined) => void;
  getInitialSnapshot: () => unknown;
  setInitialSnapshot: (next: unknown) => void;
  appendHistory: (update: IoUpdate) => void;
  clearHistory: () => void;
  exportJson: () => string;
  exportReduxImport: () => ReduxDevToolsImportState;
};

export function createHistoryController(deps: HistoryDeps): HistoryController {
  let cursor = -1;
  let lastEpochMs = deps.nowEpochMs();
  let lastSnapshot: unknown | undefined;
  let initialSnapshot: unknown;
  const history: IoHistoryEntry[] = [];

  const maybeCaptureSnapshot = (): { snapshot?: unknown; ms?: number } => {
    if (deps.snapshotStrategy === 'never') return {};
    const t0 = deps.nowPerfMs();
    const snapshot = deps.target.snapshot();
    const t1 = deps.nowPerfMs();
    return { snapshot, ms: t1 - t0 };
  };

  const appendHistory = (update: IoUpdate) => {
    const epoch = deps.nowEpochMs();
    const intervalMs = epoch - lastEpochMs;
    lastEpochMs = epoch;

    const t0 = deps.nowPerfMs();

    if (cursor < history.length - 1) history.splice(cursor + 1);

    const snapshotBefore =
      deps.snapshotStrategy === 'always' ? lastSnapshot : undefined;

    const beforeInfo =
      deps.snapshotStrategy === 'always' ? { snapshot: snapshotBefore } : undefined;
    const afterInfo = maybeCaptureSnapshot();

    const patches = deps.options?.filterPatch
      ? update.patches.filter((p) => deps.options?.filterPatch?.(p, update))
      : update.patches;

    const patchDiffs = patches.map(deps.patchToDiff);

    let diffMs: number | undefined;
    if (
      deps.snapshotStrategy === 'always' &&
      beforeInfo?.snapshot !== undefined &&
      afterInfo.snapshot !== undefined
    ) {
      const d0 = deps.nowPerfMs();
      deps.diffSnapshots(beforeInfo.snapshot, afterInfo.snapshot, {
        maxChanges: 1,
      });
      const d1 = deps.nowPerfMs();
      diffMs = d1 - d0;
    }

    const t1 = deps.nowPerfMs();

    const perf: IoDevtoolsPerfSample | undefined = deps.perfTracker.enabled
      ? {
          patchCount: update.patches.length,
          intervalMs,
          snapshotMs: afterInfo.ms,
          diffMs,
          totalMs: t1 - t0,
        }
      : undefined;

    const entry: IoHistoryEntry = {
      id: deps.createId(),
      timestamp: epoch,
      update,
      patchDiffs,
      snapshotBefore:
        deps.snapshotStrategy === 'always' ? snapshotBefore : undefined,
      snapshotAfter:
        deps.snapshotStrategy === 'always' ? afterInfo.snapshot : undefined,
      perf,
    };

    history.push(entry);
    while (history.length > deps.maxHistory) {
      history.shift();
      cursor -= 1;
    }

    cursor = history.length - 1;
    lastSnapshot = entry.snapshotAfter ?? lastSnapshot;

    if (entry.perf) deps.perfTracker.record(entry.perf);
    deps.emit({ type: 'mutation', entry, state: deps.getState() });
  };

  const clearHistory = () => {
    history.length = 0;
    cursor = -1;
  };

  const exportJson = (): string => {
    const payload = {
      name: deps.options?.name ?? 'IO',
      initialSnapshot: deps.sanitizeForJson(
        initialSnapshot,
        deps.options?.export,
      ),
      cursor,
      history: history.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        update: e.update,
        patchDiffs: e.patchDiffs,
        snapshotBefore:
          deps.snapshotStrategy === 'always'
            ? deps.sanitizeForJson(e.snapshotBefore, deps.options?.export)
            : undefined,
        snapshotAfter:
          deps.snapshotStrategy === 'always'
            ? deps.sanitizeForJson(e.snapshotAfter, deps.options?.export)
            : undefined,
        perf: e.perf,
      })),
    };
    return JSON.stringify(payload, null, 2);
  };

  const exportReduxImport = (): ReduxDevToolsImportState => {
    if (deps.snapshotStrategy !== 'always') {
      throw new Error(
        'devtools.export.reduxDevToolsImport requires captureSnapshots="always"',
      );
    }
    return deps.exportReduxDevToolsImportState({
      initialState: deps.sanitizeForJson(initialSnapshot, deps.options?.export),
      history: history.map((e) => ({
        ...e,
        snapshotAfter: deps.sanitizeForJson(e.snapshotAfter, deps.options?.export),
      })),
      cursor,
    });
  };

  return {
    history,
    getCursor: () => cursor,
    setCursor: (next) => {
      cursor = next;
    },
    getLastSnapshot: () => lastSnapshot,
    setLastSnapshot: (next) => {
      lastSnapshot = next;
    },
    getInitialSnapshot: () => initialSnapshot,
    setInitialSnapshot: (next) => {
      initialSnapshot = next;
    },
    appendHistory,
    clearHistory,
    exportJson,
    exportReduxImport,
  };
}
