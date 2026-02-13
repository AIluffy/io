import { io } from '@iostore/store';

type Filter = 'all' | 'active' | 'done';
type Todo = { id: string; title: string; done: boolean };

type SectionHandle = {
  element: HTMLElement;
  destroy: () => void;
};

export const todoStore = io({
  draft: '',
  filter: 'all' as Filter,
  todos: [
    { id: '1', title: 'Learn IO', done: false },
    { id: '2', title: 'Ship a demo', done: true },
  ] as Todo[],
});

const filters: Filter[] = ['all', 'active', 'done'];

export function createTodoSection(): SectionHandle {
  const section = document.createElement('section');
  section.className =
    'rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200';
  section.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Basic</p>
        <h2 class="mt-2 text-lg font-semibold text-slate-900">Todo List</h2>
        <p class="mt-1 text-sm text-slate-500">Deep tree updates and filters.</p>
      </div>
      <span data-remaining class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
        0 left
      </span>
    </div>

    <form data-form class="mt-6 flex flex-col gap-3 sm:flex-row">
      <input
        data-input
        placeholder="What needs to be done?"
        class="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      />
      <button
        data-add
        type="submit"
        class="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Add task
      </button>
    </form>

    <div data-filters class="mt-5 flex flex-wrap gap-2"></div>
    <div data-list class="mt-6 space-y-3"></div>
  `;

  const remainingBadge = section.querySelector('[data-remaining]');
  const form = section.querySelector('[data-form]');
  const input = section.querySelector('[data-input]');
  const filtersRow = section.querySelector('[data-filters]');
  const list = section.querySelector('[data-list]');

  if (!(remainingBadge instanceof HTMLElement)) {
    throw new Error('Missing remaining badge');
  }
  if (!(form instanceof HTMLFormElement)) {
    throw new Error('Missing form');
  }
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Missing input');
  }
  if (!(filtersRow instanceof HTMLElement)) {
    throw new Error('Missing filters row');
  }
  if (!(list instanceof HTMLElement)) {
    throw new Error('Missing list container');
  }

  const renderFilters = (active: Filter) => {
    filtersRow.innerHTML = '';
    filters.forEach((key) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = key;
      button.className =
        key === active
          ? 'rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white'
          : 'rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:border-slate-300 hover:text-slate-700';
      button.addEventListener('click', () => todoStore.filter.set(key));
      filtersRow.appendChild(button);
    });
  };

  const renderList = (todos: Todo[], filter: Filter) => {
    list.innerHTML = '';
    const filtered = todos.flatMap((todo, index) => {
      if (filter === 'active' && todo.done) return [];
      if (filter === 'done' && !todo.done) return [];
      return [{ todo, index }];
    });

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          Nothing here yet. Add your first task.
        </div>
      `;
      return;
    }

    filtered.forEach(({ todo, index }) => {
      const row = document.createElement('div');
      row.className =
        'flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = todo.done;
      checkbox.className =
        'h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400';
      checkbox.addEventListener('change', () => {
        todoStore.todos[index].done.set((value) => !value);
      });

      const title = document.createElement('p');
      title.className = todo.done
        ? 'text-sm text-slate-400 line-through'
        : 'text-sm text-slate-900';
      title.textContent = todo.title;

      const titleWrap = document.createElement('div');
      titleWrap.className = 'flex-1';
      titleWrap.appendChild(title);

      const remove = document.createElement('button');
      remove.className =
        'rounded-lg px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-700';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        todoStore.todos.splice(index, 1);
      });

      row.appendChild(checkbox);
      row.appendChild(titleWrap);
      row.appendChild(remove);
      list.appendChild(row);
    });
  };

  const render = () => {
    const snapshot = todoStore.snapshot();
    remainingBadge.textContent = `${snapshot.todos.filter((todo) => !todo.done).length} left`;
    input.value = snapshot.draft;
    renderFilters(snapshot.filter);
    renderList(snapshot.todos, snapshot.filter);
  };

  const addTodo = () => {
    const title = todoStore.draft.get().trim();
    if (!title) return;
    todoStore.todos.push({ id: String(Date.now()), title, done: false });
    todoStore.draft.set('');
  };

  const onSubmit = (event: Event) => {
    event.preventDefault();
    addTodo();
  };

  const onInput = (event: Event) => {
    if (event.currentTarget instanceof HTMLInputElement) {
      todoStore.draft.set(event.currentTarget.value);
    }
  };

  form.addEventListener('submit', onSubmit);
  input.addEventListener('input', onInput);

  const unsubscribe = todoStore.subscribe(render);
  render();

  return {
    element: section,
    destroy: () => {
      form.removeEventListener('submit', onSubmit);
      input.removeEventListener('input', onInput);
      unsubscribe();
    },
  };
}
