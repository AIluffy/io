import type {
  IoDevtools,
  IoHistoryEntry,
  IoPatchDiffTreeNode,
  IoSnapshotDiff,
} from '@iostore/devtools';
import { buildPatchDiffTree, diffSnapshots } from '@iostore/devtools';
import type { CSSProperties, MutableRefObject, ReactElement } from 'react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

export type IoDevtoolsPanelProps = {
  devtools: IoDevtools;
  height?: number;
};

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

type PatchPath = IoHistoryEntry['patchDiffs'][number]['path'];
type DevtoolsState = ReturnType<IoDevtools['getState']>;
type DevtoolsSnapshotMemo = { key: string; state: DevtoolsState };
type SnapshotDiffMode = 'collapsed' | 'sample' | 'full';

const SNAPSHOT_SAMPLE_OPTIONS = {
  maxDepth: 3,
  maxChanges: 200,
  maxArrayLength: 50,
} as const;

function formatPath(path: PatchPath): string {
  if (path.length === 0) return '$';
  return (
    '$.' +
    path.map((s) => (typeof s === 'number' ? `[${s}]` : String(s))).join('.')
  );
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function selectDevtoolsSnapshotKey(state: DevtoolsState): string {
  const perf = state.perf;
  const linkKey =
    state.links?.multiParents
      .map((entry) => entry.paths.map((p) => p.join('.')).join('|'))
      .join(';') ?? '';
  return [
    state.enabled ? 1 : 0,
    state.paused ? 1 : 0,
    state.cursor,
    state.history.length,
    state.errors.length,
    linkKey,
    perf?.recent.length ?? 0,
    perf?.summary.avgTotalMs ?? '',
    perf?.summary.maxTotalMs ?? '',
    perf?.summary.avgSnapshotMs ?? '',
    perf?.summary.maxSnapshotMs ?? '',
    perf?.summary.avgDiffMs ?? '',
    perf?.summary.maxDiffMs ?? '',
  ].join('|');
}

function memoizeDevtoolsSnapshot(
  cacheRef: MutableRefObject<DevtoolsSnapshotMemo | null>,
  state: DevtoolsState,
): DevtoolsState {
  const key = selectDevtoolsSnapshotKey(state);
  const cached = cacheRef.current;
  if (cached?.key === key) return cached.state;
  cacheRef.current = { key, state };
  return state;
}

function renderPatchTree(
  nodes: IoPatchDiffTreeNode[],
  depth = 0,
): ReactElement[] {
  return nodes.flatMap((node) => {
    const indent = 10 + depth * 12;
    const label =
      node.path.length === 0
        ? '$'
        : node.path
            .map((s) => (typeof s === 'number' ? `[${s}]` : String(s)))
            .join('.');
    const patches = node.patches ?? [];
    const children = node.children ?? [];
    const row = (
      <div
        key={`node-${label}-${depth}`}
        style={{ paddingLeft: indent, display: 'grid', gap: 4 }}
      >
        <div style={{ fontWeight: 600, opacity: 0.9 }}>{label}</div>
        {patches.length > 0 ? (
          <div style={{ opacity: 0.85 }}>
            {patches.map((p, i) => (
              <div key={`${label}-${p.op}-${i}`}>
                {p.op}
                {p.op === 'splice'
                  ? ` start=${p.start} delete=${p.deleteCount} items=${p.items.length}`
                  : p.op === 'sort'
                    ? ` order=${p.order.length}`
                    : ''}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
    return [row, ...renderPatchTree(children, depth + 1)];
  });
}

function useDevtoolsState(devtools: IoDevtools) {
  const cacheRef = useRef<DevtoolsSnapshotMemo | null>(null);

  const getSnapshot = () => {
    const state = devtools.getState();
    return memoizeDevtoolsSnapshot(cacheRef, state);
  };

  return useSyncExternalStore(
    (notify) => devtools.subscribe(() => notify()),
    getSnapshot,
    getSnapshot,
  );
}

export function IoDevtoolsPanel(props: IoDevtoolsPanelProps) {
  const state = useDevtoolsState(props.devtools);
  const [selected, setSelected] = useState<number>(() =>
    Math.max(-1, Math.min(state.history.length - 1, state.cursor)),
  );
  const multiParents = state.links?.multiParents ?? [];

  const selectedEntry: IoHistoryEntry | null =
    selected >= 0 && selected < state.history.length
      ? state.history[selected]
      : null;

  const [patchView, setPatchView] = useState<'list' | 'tree'>('tree');
  const [snapshotDiffMode, setSnapshotDiffMode] =
    useState<SnapshotDiffMode>('collapsed');

  useEffect(() => {
    setSnapshotDiffMode('collapsed');
  }, [selectedEntry?.id]);

  const patchTree: IoPatchDiffTreeNode[] | null = useMemo(() => {
    if (!selectedEntry) return null;
    return buildPatchDiffTree(selectedEntry.patchDiffs);
  }, [selectedEntry]);

  const snapshotDiffs: IoSnapshotDiff[] | null = useMemo(() => {
    if (snapshotDiffMode === 'collapsed') return null;
    if (!selectedEntry) return null;
    if (
      selectedEntry.snapshotBefore === undefined ||
      selectedEntry.snapshotAfter === undefined
    )
      return null;
    return diffSnapshots(
      selectedEntry.snapshotBefore,
      selectedEntry.snapshotAfter,
      snapshotDiffMode === 'sample' ? SNAPSHOT_SAMPLE_OPTIONS : undefined,
    );
  }, [selectedEntry, snapshotDiffMode]);

  const canDiffSnapshots =
    selectedEntry &&
    selectedEntry.snapshotBefore !== undefined &&
    selectedEntry.snapshotAfter !== undefined;

  const headerStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 10,
  };

  const panelStyle: CSSProperties = {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontSize: 12,
    border: '1px solid var(--@iostore/devtools-border)',
    borderRadius: 10,
    padding: 10,
    background: 'var(--@iostore/devtools-panel-bg)',
    color: 'var(--@iostore/devtools-text)',
    height: props.height ?? 420,
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    gap: 10,
  };

  return (
    <div className="@iostore/devtools-panel" style={panelStyle}>
      <div style={headerStyle}>
        <div className="@iostore/devtools-panel__toolbar">
          <button
            className="@iostore/devtools-panel__button"
            onClick={() => props.devtools.timeTravel.undo()}
            disabled={state.cursor < 0}
          >
            Undo
          </button>
          <button
            className="@iostore/devtools-panel__button"
            onClick={() => props.devtools.timeTravel.redo()}
            disabled={state.cursor >= state.history.length - 1}
          >
            Redo
          </button>
          <button
            className="@iostore/devtools-panel__button"
            onClick={() => {
              if (selected >= 0) props.devtools.timeTravel.goTo(selected);
            }}
            disabled={selected < 0}
          >
            Go
          </button>
          <button
            className="@iostore/devtools-panel__button"
            onClick={() =>
              state.paused ? props.devtools.resume() : props.devtools.pause()
            }
          >
            {state.paused ? 'Resume' : 'Pause'}
          </button>
          <button
            className="@iostore/devtools-panel__button"
            onClick={() => props.devtools.clear()}
            disabled={state.history.length === 0}
          >
            Clear
          </button>
          <div className="@iostore/devtools-panel__toolbar-divider" />
          <button
            className="@iostore/devtools-panel__button"
            onClick={() => {
              const json = props.devtools.export.json();
              downloadText('@iostore/devtools.json', json);
            }}
          >
            Export JSON
          </button>
          <button
            className="@iostore/devtools-panel__button"
            onClick={() => {
              const payload = props.devtools.export.reduxDevToolsImport();
              downloadText(
                'io-redux-devtools-import.json',
                JSON.stringify(payload, null, 2),
              );
            }}
          >
            Export Redux Import
          </button>
        </div>

        <div className="@iostore/devtools-panel__seek-row">
          <label className="@iostore/devtools-panel__seek">
            <span>Seek</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, state.history.length - 1)}
              value={Math.max(0, selected)}
              onChange={(e) => setSelected(Number(e.target.value))}
              disabled={state.history.length === 0}
            />
          </label>

          <div className="@iostore/devtools-panel__meta">
            <div>Cursor: {state.cursor}</div>
            <div>History: {state.history.length}</div>
            {state.perf ? (
              <div>Avg: {state.perf.summary.avgTotalMs.toFixed(2)}ms</div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: 10,
          minHeight: 0,
        }}
      >
        <div
          style={{
            border: '1px solid var(--@iostore/devtools-border)',
            borderRadius: 10,
            background: 'var(--@iostore/devtools-surface)',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              padding: 8,
              fontWeight: 700,
              borderBottom: '1px solid var(--@iostore/devtools-divider)',
            }}
            className="@iostore/devtools-panel__section-title"
          >
            Timeline
          </div>
          {state.history.map((e, idx) => {
            const active = idx === selected;
            const cursorHere = idx === state.cursor;
            const first = e.patchDiffs[0];
            const label = first
              ? `${first.op} ${formatPath(first.path)}`
              : 'update';
            return (
              <button
                key={e.id}
                className={`@iostore/devtools-panel__timeline-item${active ? ' is-active' : ''}${cursorHere ? ' is-cursor' : ''}`}
                onClick={() => setSelected(idx)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 'none',
                  borderBottom: '1px solid var(--@iostore/devtools-divider)',
                  background: active
                    ? 'var(--@iostore/devtools-timeline-active-bg)'
                    : 'var(--@iostore/devtools-timeline-bg)',
                  cursor: 'pointer',
                }}
              >
                <div className="@iostore/devtools-panel__muted">{idx}</div>
                <div style={{ display: 'grid', gap: 2 }}>
                  <div style={{ fontWeight: 600 }}>
                    {cursorHere ? '▶ ' : ''}
                    {label}
                  </div>
                  <div className="@iostore/devtools-panel__muted">
                    {formatTimestamp(e.timestamp)}
                    {e.perf
                      ? ` · ${e.perf.totalMs.toFixed(2)}ms · ${e.perf.patchCount} patches`
                      : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div
          style={{
            border: '1px solid var(--@iostore/devtools-border)',
            borderRadius: 10,
            background: 'var(--@iostore/devtools-surface)',
            overflow: 'auto',
            minHeight: 0,
            marginTop: 0,
          }}
        >
          <div
            style={{
              padding: 8,
              fontWeight: 700,
              borderBottom: '1px solid var(--@iostore/devtools-divider)',
            }}
            className="@iostore/devtools-panel__section-title"
          >
            Details
          </div>
          {!selectedEntry ? (
            <div style={{ padding: 10 }} className="@iostore/devtools-panel__muted">
              Select an entry to inspect diffs.
            </div>
          ) : (
            <div style={{ padding: 10, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontWeight: 700 }}>Patch diffs</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="@iostore/devtools-panel__button"
                    onClick={() => setPatchView('tree')}
                    disabled={patchView === 'tree'}
                  >
                    Tree
                  </button>
                  <button
                    className="@iostore/devtools-panel__button"
                    onClick={() => setPatchView('list')}
                    disabled={patchView === 'list'}
                  >
                    List
                  </button>
                </div>
                {patchView === 'list' ? (
                  <pre
                    style={{
                      margin: 0,
                      padding: 10,
                      borderRadius: 8,
                      background: 'var(--@iostore/devtools-surface-strong)',
                      overflowX: 'auto',
                    }}
                  >
                    {JSON.stringify(selectedEntry.patchDiffs, null, 2)}
                  </pre>
                ) : (
                  <div
                    style={{
                      margin: 0,
                      padding: 10,
                      borderRadius: 8,
                      background: 'var(--@iostore/devtools-surface-strong)',
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    {patchTree ? renderPatchTree(patchTree) : null}
                  </div>
                )}
              </div>

              {canDiffSnapshots ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Snapshot diffs</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="@iostore/devtools-panel__button"
                      onClick={() =>
                        setSnapshotDiffMode((current) =>
                          current === 'collapsed' ? 'sample' : 'collapsed',
                        )
                      }
                    >
                      {snapshotDiffMode === 'collapsed'
                        ? 'Show (sample)'
                        : 'Hide'}
                    </button>
                    <button
                      className="@iostore/devtools-panel__button"
                      onClick={() => setSnapshotDiffMode('full')}
                      disabled={snapshotDiffMode === 'full'}
                    >
                      Deep diff
                    </button>
                  </div>
                  {snapshotDiffMode === 'collapsed' ? (
                    <div className="@iostore/devtools-panel__muted">
                      Snapshot diffs are computed on demand. Use sample for quick
                      checks, deep diff for full detail.
                    </div>
                  ) : (
                    <>
                      {snapshotDiffMode === 'sample' ? (
                        <div className="@iostore/devtools-panel__muted">
                          Sampled diff (depth {SNAPSHOT_SAMPLE_OPTIONS.maxDepth},
                          max {SNAPSHOT_SAMPLE_OPTIONS.maxChanges} changes).
                        </div>
                      ) : null}
                      <pre
                        style={{
                          margin: 0,
                          padding: 10,
                          borderRadius: 8,
                          background: 'var(--@iostore/devtools-surface-strong)',
                          overflowX: 'auto',
                        }}
                      >
                        {JSON.stringify(snapshotDiffs ?? [], null, 2)}
                      </pre>
                    </>
                  )}
                </div>
              ) : null}

              {multiParents.length > 0 ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Multi-parent links</div>
                  <div
                    style={{
                      margin: 0,
                      padding: 10,
                      borderRadius: 8,
                      background: 'var(--@iostore/devtools-surface-strong)',
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    {multiParents.map((entry, index) => (
                      <div key={`multi-parent-${index}`}>
                        <div style={{ fontWeight: 600 }}>
                          Multi-parent #{index + 1}
                        </div>
                        <div className="@iostore/devtools-panel__muted">
                          Paths: {entry.paths.map(formatPath).join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
