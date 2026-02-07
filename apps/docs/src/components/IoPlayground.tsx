import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createIoDevtools } from 'io-devtools';
import {
  IoDevtoolsErrorBoundary,
  IoDevtoolsPanel,
} from 'io-devtools-react';
import { batch, io } from 'io-store';

export function IoPlayground() {
  const store = useMemo(
    () =>
      io<{
        counter: number;
        user: { name: string };
        todos: Array<{ id: string; title: string; done: boolean }>;
      }>({
        counter: 0,
        user: { name: 'Ada' },
        todos: [{ id: 'a', title: 'Learn IO', done: false }],
      }),
    [],
  );

  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    store.snapshot,
  );
  const devtools = useMemo(
    () =>
      createIoDevtools(store, {
        name: 'IO Playground',
        maxHistory: 200,
        captureSnapshots: 'always',
        reduxDevTools: { enabled: true, name: 'IO Playground' },
        perf: { enabled: true, windowSize: 60, sampleRate: 1 },
      }),
    [store],
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
        <button onClick={() => store.counter.update((v) => v + 1)}>
          counter +1
        </button>
        <button
          onClick={() =>
            batch(() => {
              store.counter.update((v) => v + 1);
              store.counter.update((v) => v + 1);
            })
          }
        >
          batch +2
        </button>
        <button
          onClick={() =>
            store.user.name.update((n) => (n === 'Ada' ? 'Grace' : 'Ada'))
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
            if (first.done.get()) first.done.set(false as const);
            else first.done.set(true as const);
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

      <IoDevtoolsErrorBoundary>
        <IoDevtoolsPanel devtools={devtools} />
      </IoDevtoolsErrorBoundary>
    </div>
  );
}
