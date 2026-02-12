import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createIoDevtools } from 'io-devtools';
import {
  IoDevtoolsErrorBoundary,
  IoDevtoolsPanel,
} from 'io-devtools-react';
import { io } from 'io-store';

type Filter = 'all' | 'active' | 'done';
type Todo = { id: string; title: string; done: boolean };

const filters: Filter[] = ['all', 'active', 'done'];

export function IoDevtoolsTodoExample() {
  const store = useMemo(
    () =>
      io<{
        draft: string;
        filter: Filter;
        todos: Todo[];
      }>({
        draft: '',
        filter: 'all',
        todos: [
          { id: '1', title: 'Learn IO', done: false },
          { id: '2', title: 'Ship a demo', done: true },
        ],
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
        name: 'IO Todo Devtools',
        maxHistory: 200,
        captureSnapshots: 'always',
        reduxDevTools: { enabled: true, name: 'IO Todo Devtools' },
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

  const filteredTodos = snapshot.todos.flatMap((todo, index) => {
    if (snapshot.filter === 'active' && todo.done) return [];
    if (snapshot.filter === 'done' && !todo.done) return [];
    return [{ todo, index }];
  });

  const remaining = snapshot.todos.filter((todo) => !todo.done).length;

  return (
    <div className="io-devtools-todo">
      <section className="io-playground__card io-devtools-todo__panel">
        <div className="io-devtools-todo__head">
          <div>
            <div className="io-playground__kicker">Todo List</div>
            <p className="io-devtools-todo__hint">
              Based on the example todo list, connected to IO DevTools.
            </p>
          </div>
          <span className="io-devtools-todo__badge">{remaining} left</span>
        </div>

        <form
          className="io-devtools-todo__form"
          onSubmit={(event) => {
            event.preventDefault();
            const title = store.draft.get().trim();
            if (!title) return;
            store.todos.push({ id: String(Date.now()), title, done: false });
            store.draft.set('');
          }}
        >
          <input
            className="io-devtools-todo__input"
            value={snapshot.draft}
            onChange={(event) => store.draft.set(event.currentTarget.value)}
            placeholder="What needs to be done?"
          />
          <button className="io-playground__button" type="submit">
            Add task
          </button>
        </form>

        <div className="io-devtools-todo__filters">
          {filters.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={snapshot.filter === key}
              className="io-devtools-todo__filter"
              data-active={snapshot.filter === key}
              onClick={() => store.filter.set(key)}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="io-devtools-todo__list">
          {filteredTodos.length === 0 ? (
            <div className="io-devtools-todo__empty">
              Nothing here yet. Add your first task.
            </div>
          ) : (
            filteredTodos.map(({ todo, index }) => (
              <div className="io-devtools-todo__item" key={todo.id}>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => store.todos[index].done.set((value) => !value)}
                />
                <span
                  className="io-devtools-todo__title"
                  data-done={todo.done ? 'true' : undefined}
                >
                  {todo.title}
                </span>
                <button
                  type="button"
                  className="io-devtools-todo__remove"
                  onClick={() => store.todos.splice(index, 1)}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
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
