import type {
  OinDevtools,
  OinHistoryEntry,
  OinPatchDiffTreeNode,
  OinSnapshotDiff,
} from '@oin/devtools';
import { buildPatchDiffTree, diffSnapshots } from '@oin/devtools';
import type { CSSProperties, ReactElement } from 'react';
import { useMemo, useState, useSyncExternalStore } from 'react';

export type OinDevtoolsPanelProps = {
  devtools: OinDevtools;
  height?: number;
};

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

type PatchPath = OinHistoryEntry['patchDiffs'][number]['path'];

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

function renderPatchTree(
  nodes: OinPatchDiffTreeNode[],
  depth = 0
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

function useDevtoolsState(devtools: OinDevtools) {
  return useSyncExternalStore(
    (notify) => devtools.subscribe(() => notify()),
    () => devtools.getState(),
    () => devtools.getState(),
  );
}

export function OinDevtoolsPanel(props: OinDevtoolsPanelProps) {
  const state = useDevtoolsState(props.devtools);
  const [selected, setSelected] = useState<number>(() =>
    Math.max(-1, Math.min(state.history.length - 1, state.cursor)),
  );

  const selectedEntry: OinHistoryEntry | null =
    selected >= 0 && selected < state.history.length
      ? state.history[selected]
      : null;

  const [patchView, setPatchView] = useState<'list' | 'tree'>('tree');

  const patchTree: OinPatchDiffTreeNode[] | null = useMemo(() => {
    if (!selectedEntry) return null;
    return buildPatchDiffTree(selectedEntry.patchDiffs);
  }, [selectedEntry]);

  const snapshotDiffs: OinSnapshotDiff[] | null = useMemo(() => {
    if (!selectedEntry) return null;
    if (
      selectedEntry.snapshotBefore === undefined ||
      selectedEntry.snapshotAfter === undefined
    )
      return null;
    return diffSnapshots(
      selectedEntry.snapshotBefore,
      selectedEntry.snapshotAfter,
    );
  }, [selectedEntry]);

  const headerStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  };

  const panelStyle: CSSProperties = {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontSize: 12,
    border: '1px solid rgba(148,163,184,0.35)',
    borderRadius: 10,
    padding: 10,
    background: 'rgba(148,163,184,0.08)',
    height: props.height ?? 420,
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    gap: 10,
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <button
          onClick={() => props.devtools.timeTravel.undo()}
          disabled={state.cursor < 0}
        >
          Undo
        </button>
        <button
          onClick={() => props.devtools.timeTravel.redo()}
          disabled={state.cursor >= state.history.length - 1}
        >
          Redo
        </button>
        <button
          onClick={() => {
            if (selected >= 0) props.devtools.timeTravel.goTo(selected);
          }}
          disabled={selected < 0}
        >
          Go
        </button>
        <button
          onClick={() =>
            state.paused ? props.devtools.resume() : props.devtools.pause()
          }
        >
          {state.paused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={() => props.devtools.clear()}
          disabled={state.history.length === 0}
        >
          Clear
        </button>
        <button
          onClick={() => {
            const json = props.devtools.export.json();
            downloadText('oin-devtools.json', json);
          }}
        >
          Export JSON
        </button>
        <button
          onClick={() => {
            const payload = props.devtools.export.reduxDevToolsImport();
            downloadText(
              'oin-redux-devtools-import.json',
              JSON.stringify(payload, null, 2),
            );
          }}
        >
          Export Redux Import
        </button>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ opacity: 0.8 }}>Seek</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, state.history.length - 1)}
            value={Math.max(0, selected)}
            onChange={(e) => setSelected(Number(e.target.value))}
            disabled={state.history.length === 0}
          />
        </label>

        <div
          style={{ marginLeft: 'auto', display: 'flex', gap: 10, opacity: 0.9 }}
        >
          <div>Cursor: {state.cursor}</div>
          <div>History: {state.history.length}</div>
          {state.perf ? (
            <div>Avg: {state.perf.summary.avgTotalMs.toFixed(2)}ms</div>
          ) : null}
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
            border: '1px solid rgba(148,163,184,0.35)',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.6)',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              padding: 8,
              fontWeight: 700,
              borderBottom: '1px solid rgba(148,163,184,0.2)',
            }}
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
                onClick={() => setSelected(idx)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 'none',
                  borderBottom: '1px solid rgba(148,163,184,0.15)',
                  background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ opacity: 0.7 }}>{idx}</div>
                <div style={{ display: 'grid', gap: 2 }}>
                  <div style={{ fontWeight: 600 }}>
                    {cursorHere ? '▶ ' : ''}
                    {label}
                  </div>
                  <div style={{ opacity: 0.7 }}>
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
            border: '1px solid rgba(148,163,184,0.35)',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.6)',
            overflow: 'auto',
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: 8,
              fontWeight: 700,
              borderBottom: '1px solid rgba(148,163,184,0.2)',
            }}
          >
            Details
          </div>
          {!selectedEntry ? (
            <div style={{ padding: 10, opacity: 0.75 }}>
              Select an entry to inspect diffs.
            </div>
          ) : (
            <div style={{ padding: 10, display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontWeight: 700 }}>Patch diffs</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setPatchView('tree')}
                  disabled={patchView === 'tree'}
                >
                  Tree
                </button>
                <button
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
                    background: 'rgba(148,163,184,0.12)',
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
                    background: 'rgba(148,163,184,0.12)',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  {patchTree ? renderPatchTree(patchTree) : null}
                </div>
              )}
            </div>

              {snapshotDiffs ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Snapshot diffs</div>
                  <pre
                    style={{
                      margin: 0,
                      padding: 10,
                      borderRadius: 8,
                      background: 'rgba(148,163,184,0.12)',
                      overflowX: 'auto',
                    }}
                  >
                    {JSON.stringify(snapshotDiffs, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
