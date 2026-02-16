import { io } from '@iostore/store';
import { useIO } from '@iostore/lynx';

import { AsyncDetailTemplate } from './templates/async/detail';
import { AsyncFormTemplate } from './templates/async/form';
import { AsyncListTemplate } from './templates/async/list';
import { AsyncLongTaskTemplate } from './templates/async/long-task';
import type { LynxInputEvent } from './types/lynx-events';

type Filter = 'all' | 'active' | 'done';
type Todo = { id: string; title: string; done: boolean };

const store = io({
  draft: '',
  filter: 'all' as Filter,
  todos: [
    { id: '1', title: 'Learn IO', done: false },
    { id: '2', title: 'Ship a demo', done: true },
  ] as Todo[],
});

const filters: Filter[] = ['all', 'active', 'done'];

export function App() {
  const state = useIO(store);
  const { draft, filter, todos } = state;
  const filteredTodos = todos.flatMap((todo, index) => {
    if (filter === 'active' && todo.done) return [];
    if (filter === 'done' && !todo.done) return [];
    return [{ todo, index }];
  });
  const remaining = todos.filter((todo) => !todo.done).length;

  const addTodo = () => {
    const title = draft.trim();
    if (!title) return;
    store.todos.push({ id: String(Date.now()), title, done: false });
    store.draft.set('');
  };

  return (
    <scroll-view className="page" scroll-orientation="vertical">
      <view className="container">
        <view className="hero">
          <text className="eyebrow">IO + Lynx</text>
          <text className="title">Examples Gallery</text>
          <text className="subtitle">Sync and async patterns with IO Tree updates.</text>
          <text className="badge">{remaining} todo left</text>
        </view>

        <view className="card">
          <text className="card-title">Todo List</text>
          <text className="card-desc">Deep tree updates and filters.</text>

          <view className="row mt16">
            <input
              className="input"
              value={draft}
              placeholder="What needs to be done?"
              bindinput={(event: LynxInputEvent) => store.draft.set(event.detail.value)}
            />
            <view className="button primary" bindtap={addTodo}>
              <text className="button-text">Add task</text>
            </view>
          </view>

          <view className="row mt12 wrap">
            {filters.map((key) => (
              <view
                key={key}
                className={key === filter ? 'chip active' : 'chip'}
                bindtap={() => store.filter.set(key)}
              >
                <text className={key === filter ? 'chip-text active' : 'chip-text'}>{key}</text>
              </view>
            ))}
          </view>

          <view className="list mt16">
            {filteredTodos.length === 0 ? (
              <view className="empty">
                <text className="empty-text">Nothing here yet. Add your first task.</text>
              </view>
            ) : (
              filteredTodos.map(({ todo, index }) => (
                <view key={todo.id} className="todo-item">
                  <view className="todo-main">
                    <view className={todo.done ? 'dot done' : 'dot'} />
                    <text className={todo.done ? 'todo-text done' : 'todo-text'}>{todo.title}</text>
                  </view>
                  <view className="todo-actions">
                    <view
                      className="button ghost"
                      bindtap={() => store.todos[index].done.set((value) => !value)}
                    >
                      <text className="button-text ghost">Toggle</text>
                    </view>
                    <view className="button ghost" bindtap={() => store.todos.splice(index, 1)}>
                      <text className="button-text ghost">Remove</text>
                    </view>
                  </view>
                </view>
              ))
            )}
          </view>
        </view>

        <AsyncListTemplate />
        <AsyncDetailTemplate />
        <AsyncFormTemplate />
        <AsyncLongTaskTemplate />
      </view>
    </scroll-view>
  );
}
