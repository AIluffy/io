import { batch, oinDeep } from '../../../../packages/oin/src/index';
import { createOinDevtools } from '../../../../packages/oin-devtools/src/index';
import {
  OinDevtoolsErrorBoundary,
  OinDevtoolsPanel,
} from '../../../../packages/oin-devtools-react/src/index';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

export function OinPlayground() {
  const store = useMemo(
    () =>
      oinDeep<{
        counter: number;
        user: { name: string };
        todos: Array<{ id: string; title: string; done: boolean }>;
      }>({
        counter: 0,
        user: { name: 'Ada' },
        todos: [{ id: 'a', title: 'Learn OIN', done: false }],
      }),
    []
  );

  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    store.snapshot
  );
  const devtools = useMemo(
    () =>
      createOinDevtools(store, {
        name: 'OIN Playground',
        maxHistory: 200,
        captureSnapshots: 'always',
        reduxDevTools: { enabled: true, name: 'OIN Playground' },
        perf: { enabled: true, windowSize: 60, sampleRate: 1 },
      }),
    [store]
  );

  useEffect(() => {
    const bridge = devtools.connectReduxDevToolsExtension({
      window: globalThis,
    });
    return () => {
      bridge?.disconnect();
      devtools.destroy();
    };
  }, [devtools]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button onClick={() => store.counter((v) => v + 1)}>counter +1</button>
        <button
          onClick={() =>
            batch(() => {
              store.counter((v) => v + 1);
              store.counter((v) => v + 1);
            })
          }
        >
          batch +2
        </button>
        <button
          onClick={() =>
            store.user.name((n) => (n === 'Ada' ? 'Grace' : 'Ada'))
          }
        >
          toggle name
        </button>
        <button
          onClick={() =>
            store.todos.push({
              id: String(Date.now()),
              title: 'New todo',
              done: false,
            })
          }
        >
          add todo
        </button>
        <button
          onClick={() => {
            const first = store.todos[0];
            if (!first) return;
            if (first.done()) first.done(false as const);
            else first.done(true as const);
          }}
        >
          toggle first todo
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Snapshot</div>
          <pre
            style={{
              margin: 0,
              padding: 12,
              background: 'rgba(148,163,184,0.12)',
              borderRadius: 8,
              overflowX: 'auto',
            }}
          >
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        </div>
      </div>

      <OinDevtoolsErrorBoundary>
        <OinDevtoolsPanel devtools={devtools} />
      </OinDevtoolsErrorBoundary>
    </div>
  );
}
