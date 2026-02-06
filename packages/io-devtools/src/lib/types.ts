import type { IoMutationOp, IoPatch, IoUpdate } from 'io-store';

export type Unsubscribe = () => void;

export type IoPath = IoPatch['path'];

export type IoErrorHandler = (
  error: unknown,
  path: IoPath,
  operation: IoMutationOp,
) => void;

export type IoDevtoolsTarget = {
  snapshot: () => unknown;
  subscribeUpdate: (fn: (u: IoUpdate) => void) => Unsubscribe;
};

export type IoDevtoolsSnapshotStrategy = 'never' | 'always';

export type IoDevtoolsPerfOptions = {
  enabled?: boolean;
  sampleRate?: number;
  windowSize?: number;
};

export type IoDevtoolsReduxBridgeOptions = {
  enabled?: boolean;
  name?: string;
};

export type IoDevtoolsExportOptions = {
  maxDepth?: number;
  maxArrayLength?: number;
  maxStringLength?: number;
  redact?: (path: IoPath, value: unknown) => unknown;
};

export type IoDevtoolsOptions = {
  name?: string;
  enabled?: boolean;
  maxHistory?: number;
  captureSnapshots?: IoDevtoolsSnapshotStrategy;
  perf?: IoDevtoolsPerfOptions;
  export?: IoDevtoolsExportOptions;
  reduxDevTools?: IoDevtoolsReduxBridgeOptions;
  filterPatch?: (patch: IoPatch, update: IoUpdate) => boolean;
  onDevtoolsError?: (error: unknown) => void;
};

export type IoDevtoolsPerfSample = {
  patchCount: number;
  intervalMs?: number;
  snapshotMs?: number;
  diffMs?: number;
  totalMs: number;
};

export type IoDevtoolsPerfSummary = {
  windowSize: number;
  avgTotalMs: number;
  maxTotalMs: number;
  avgSnapshotMs?: number;
  maxSnapshotMs?: number;
  avgDiffMs?: number;
  maxDiffMs?: number;
};

export type IoPatchDiff =
  | {
      op: 'set';
      path: IoPath;
      prev: unknown;
      next: unknown;
    }
  | {
      op: 'splice';
      path: IoPath;
      start: number;
      deleteCount: number;
      deleted: ReadonlyArray<unknown>;
      items: ReadonlyArray<unknown>;
    }
  | {
      op: 'sort';
      path: IoPath;
      order: ReadonlyArray<number>;
    };

export type IoSnapshotDiff = {
  path: IoPath;
  prev: unknown;
  next: unknown;
};

export type IoPatchDiffTreeNode = {
  key: PropertyKey;
  path: IoPath;
  children?: IoPatchDiffTreeNode[];
  patches?: IoPatchDiff[];
};

export type IoHistoryEntry = {
  id: string;
  timestamp: number;
  update: IoUpdate;
  patchDiffs: IoPatchDiff[];
  snapshotBefore?: unknown;
  snapshotAfter?: unknown;
  perf?: IoDevtoolsPerfSample;
};

export type IoDevtoolsState = {
  enabled: boolean;
  paused: boolean;
  cursor: number;
  history: ReadonlyArray<IoHistoryEntry>;
  errors: ReadonlyArray<unknown>;
  perf?: {
    recent: ReadonlyArray<IoDevtoolsPerfSample>;
    summary: IoDevtoolsPerfSummary;
  };
};

export type IoDevtoolsEvent =
  | { type: 'mutation'; entry: IoHistoryEntry; state: IoDevtoolsState }
  | {
      type: 'error';
      source: 'io' | 'devtools' | 'bridge';
      error: unknown;
      path?: IoPath;
      operation?: IoMutationOp;
      state: IoDevtoolsState;
    }
  | {
      type: 'timeTravel';
      kind: 'undo' | 'redo' | 'goTo' | 'clear';
      from: number;
      to: number;
      state: IoDevtoolsState;
    }
  | {
      type: 'perf';
      sample: IoDevtoolsPerfSample;
      summary: IoDevtoolsPerfSummary;
      state: IoDevtoolsState;
    }
  | { type: 'bridge'; connected: boolean; state: IoDevtoolsState };

export type IoDevtoolsBridge = {
  disconnect: () => void;
};

export type IoDevtools = {
  getState: () => IoDevtoolsState;
  subscribe: (listener: (event: IoDevtoolsEvent) => void) => Unsubscribe;
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
  }) => IoDevtoolsBridge | null;
};

export type ReduxDevToolsImportState = {
  actionsById: Record<string, { type: string }>;
  computedStates: Array<{ state: unknown }>;
  currentStateIndex: number;
  nextActionId: number;
  skippedActionIds: number[];
  stagedActionIds: number[];
};
