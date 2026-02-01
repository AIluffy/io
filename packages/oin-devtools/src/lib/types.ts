import type { OinMutationOp, OinPatch, OinUpdate } from '@org/oin';

export type Unsubscribe = () => void;

export type OinPath = ReadonlyArray<string | number>;

export type OinErrorHandler = (
  error: unknown,
  path: OinPath,
  operation: OinMutationOp
) => void;

export type OinDevtoolsTarget = {
  snapshot: () => unknown;
  subscribeUpdate: (fn: (u: OinUpdate) => void) => Unsubscribe;
};

export type OinDevtoolsSnapshotStrategy = 'never' | 'always';

export type OinDevtoolsPerfOptions = {
  enabled?: boolean;
  sampleRate?: number;
  windowSize?: number;
};

export type OinDevtoolsReduxBridgeOptions = {
  enabled?: boolean;
  name?: string;
};

export type OinDevtoolsExportOptions = {
  maxDepth?: number;
  maxArrayLength?: number;
  maxStringLength?: number;
  redact?: (path: OinPath, value: unknown) => unknown;
};

export type OinDevtoolsOptions = {
  name?: string;
  enabled?: boolean;
  maxHistory?: number;
  captureSnapshots?: OinDevtoolsSnapshotStrategy;
  perf?: OinDevtoolsPerfOptions;
  export?: OinDevtoolsExportOptions;
  reduxDevTools?: OinDevtoolsReduxBridgeOptions;
  filterPatch?: (patch: OinPatch, update: OinUpdate) => boolean;
  onDevtoolsError?: (error: unknown) => void;
};

export type OinDevtoolsPerfSample = {
  patchCount: number;
  intervalMs?: number;
  snapshotMs?: number;
  diffMs?: number;
  totalMs: number;
};

export type OinDevtoolsPerfSummary = {
  windowSize: number;
  avgTotalMs: number;
  maxTotalMs: number;
  avgSnapshotMs?: number;
  maxSnapshotMs?: number;
  avgDiffMs?: number;
  maxDiffMs?: number;
};

export type OinPatchDiff =
  | {
      op: 'set';
      path: OinPath;
      prev: unknown;
      next: unknown;
    }
  | {
      op: 'splice';
      path: OinPath;
      start: number;
      deleteCount: number;
      deleted: unknown[];
      items: unknown[];
    }
  | {
      op: 'sort';
      path: OinPath;
      order: number[];
    };

export type OinSnapshotDiff = {
  path: OinPath;
  prev: unknown;
  next: unknown;
};

export type OinHistoryEntry = {
  id: string;
  timestamp: number;
  update: OinUpdate;
  patchDiffs: OinPatchDiff[];
  snapshotBefore?: unknown;
  snapshotAfter?: unknown;
  perf?: OinDevtoolsPerfSample;
};

export type OinDevtoolsState = {
  enabled: boolean;
  paused: boolean;
  cursor: number;
  history: ReadonlyArray<OinHistoryEntry>;
  errors: ReadonlyArray<unknown>;
  perf?: {
    recent: ReadonlyArray<OinDevtoolsPerfSample>;
    summary: OinDevtoolsPerfSummary;
  };
};

export type OinDevtoolsEvent =
  | { type: 'mutation'; entry: OinHistoryEntry; state: OinDevtoolsState }
  | {
      type: 'error';
      source: 'oin' | 'devtools' | 'bridge';
      error: unknown;
      path?: OinPath;
      operation?: OinMutationOp;
      state: OinDevtoolsState;
    }
  | {
      type: 'timeTravel';
      kind: 'undo' | 'redo' | 'goTo' | 'clear';
      from: number;
      to: number;
      state: OinDevtoolsState;
    }
  | {
      type: 'perf';
      sample: OinDevtoolsPerfSample;
      summary: OinDevtoolsPerfSummary;
      state: OinDevtoolsState;
    }
  | { type: 'bridge'; connected: boolean; state: OinDevtoolsState };

export type OinDevtoolsBridge = {
  disconnect: () => void;
};

export type OinDevtools = {
  getState: () => OinDevtoolsState;
  subscribe: (listener: (event: OinDevtoolsEvent) => void) => Unsubscribe;
  setEnabled: (enabled: boolean) => void;
  pause: () => void;
  resume: () => void;
  destroy: () => void;
  clear: () => void;
  timeTravel: {
    undo: () => boolean;
    redo: () => boolean;
    goTo: (index: number) => boolean;
  };
  export: {
    json: () => string;
    reduxDevToolsImport: () => ReduxDevToolsImportState;
  };
  connectReduxDevToolsExtension: (options?: {
    window?: unknown;
    name?: string;
  }) => OinDevtoolsBridge | null;
};

export type ReduxDevToolsImportState = {
  actionsById: Record<string, { type: string }>;
  computedStates: Array<{ state: unknown }>;
  currentStateIndex: number;
  nextActionId: number;
  skippedActionIds: number[];
  stagedActionIds: number[];
};
