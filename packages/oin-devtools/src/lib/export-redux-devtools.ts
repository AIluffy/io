import type {
  OinHistoryEntry,
  OinPath,
  ReduxDevToolsImportState,
} from './types.js';

function formatPath(path: OinPath): string {
  if (path.length === 0) return '$';
  return '$.' + path.map((s) => (typeof s === 'number' ? `[${s}]` : String(s))).join('.');
}

function summarizeEntry(entry: OinHistoryEntry): string {
  const first = entry.patchDiffs[0];
  if (!first) return 'OIN_UPDATE';
  if (first.op === 'set') return `OIN_SET ${formatPath(first.path)}`;
  if (first.op === 'splice') return `OIN_SPLICE ${formatPath(first.path)}`;
  if (first.op === 'sort') return `OIN_SORT ${formatPath(first.path)}`;
  return 'OIN_UPDATE';
}

export function exportReduxDevToolsImportState(args: {
  initialState: unknown;
  history: ReadonlyArray<OinHistoryEntry>;
  cursor: number;
}): ReduxDevToolsImportState {
  const actionsById: Record<string, { type: string }> = {
    '0': { type: '@@OIN/INIT' },
  };
  const computedStates: Array<{ state: unknown }> = [{ state: args.initialState }];

  for (let i = 0; i < args.history.length; i += 1) {
    const entry = args.history[i];
    const actionId = String(i + 1);
    actionsById[actionId] = { type: summarizeEntry(entry) };
    computedStates.push({ state: entry.snapshotAfter });
  }

  const stagedActionIds = new Array<number>(args.history.length + 1);
  for (let i = 0; i < stagedActionIds.length; i += 1) stagedActionIds[i] = i;

  const currentStateIndex = Math.max(
    0,
    Math.min(computedStates.length - 1, args.cursor + 1)
  );

  return {
    actionsById,
    computedStates,
    currentStateIndex,
    nextActionId: args.history.length + 1,
    skippedActionIds: [],
    stagedActionIds,
  };
}
