import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createIoDevtools } from '@iostore/devtools';
import {
  IoDevtoolsErrorBoundary,
  IoDevtoolsPanel,
} from '@iostore/devtools-react';
import { batch, io } from '@iostore/store';

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
    <div className="io-playground">
      <section className="io-playground__card io-playground__controls">
        <div className="io-playground__kicker">Actions</div>
        <div className="io-playground__buttons">
          <button
            className="io-playground__button"
            onClick={() => store.counter.set((v) => v + 1)}
          >
          counter +1
          </button>
          <button
            className="io-playground__button"
            onClick={() =>
              batch(() => {
                store.counter.set((v) => v + 1);
                store.counter.set((v) => v + 1);
              })
            }
          >
          batch +2
          </button>
          <button
            className="io-playground__button"
            onClick={() =>
              store.user.name.set((n) => (n === 'Ada' ? 'Grace' : 'Ada'))
            }
          >
          toggle name
          </button>
          <button
            className="io-playground__button"
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
            className="io-playground__button"
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
      </section>

      <section className="io-playground__card">
        <div className="io-playground__kicker">Snapshot</div>
        <pre className="io-playground__snapshot">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </section>

      <section className="io-playground__card io-playground__devtools">
        <div className="io-playground__kicker">Devtools</div>
        <div className="io-playground__panel">
          <IoDevtoolsErrorBoundary>
            <IoDevtoolsPanel devtools={devtools} />
          </IoDevtoolsErrorBoundary>
        </div>
      </section>
    </div>
  );
}
