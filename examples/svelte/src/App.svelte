<script>
  import { io } from '@iostore/store';
  import { toReadable } from '@iostore/svelte';
  import AsyncDetail from './templates/async/Detail.svelte';
  import AsyncForm from './templates/async/Form.svelte';
  import AsyncList from './templates/async/List.svelte';
  import AsyncLongTask from './templates/async/LongTask.svelte';

  const store = io({
    draft: '',
    filter: 'all',
    todos: [
      { id: '1', title: 'Learn IO', done: false },
      { id: '2', title: 'Ship a demo', done: true },
    ],
  });

  const filters = ['all', 'active', 'done'];
  const state = toReadable(store);

  const addTodo = () => {
    const title = store.draft.get().trim();
    if (!title) return;
    store.todos.push({ id: String(Date.now()), title, done: false });
    store.draft.set('');
  };

  const toggleTodo = (index) => {
    store.todos[index].done.set((value) => !value);
  };

  const removeTodo = (index) => {
    store.todos.splice(index, 1);
  };

  const setFilter = (next) => {
    store.filter.set(next);
  };

  $: filteredTodos = $state.todos.flatMap((todo, index) => {
    if ($state.filter === 'active' && todo.done) return [];
    if ($state.filter === 'done' && !todo.done) return [];
    return [{ todo, index }];
  });

  $: remaining = $state.todos.filter((todo) => !todo.done).length;
</script>

<main class="min-h-screen bg-slate-100">
  <div class="mx-auto max-w-6xl px-6 py-10">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
          IO + Svelte
        </p>
        <h1 class="mt-2 text-3xl font-semibold text-slate-900">
          Examples Gallery
        </h1>
        <p class="mt-2 text-sm text-slate-500">
          Sync and async patterns built with Units and Tree updates.
        </p>
      </div>
      <span
        class="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200"
      >
        {remaining} todo left
      </span>
    </div>

    <div class="mt-8 grid gap-6 lg:grid-cols-2">
      <section class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Basic
            </p>
            <h2 class="mt-2 text-lg font-semibold text-slate-900">
              Todo List
            </h2>
            <p class="mt-1 text-sm text-slate-500">
              Deep tree updates and filters.
            </p>
          </div>
          <span
            class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {remaining} left
          </span>
        </div>

        <div class="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={$state.draft}
            placeholder="What needs to be done?"
            class="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            on:input={(event) => store.draft.set(event.currentTarget.value)}
            on:keydown={(event) => event.key === 'Enter' && addTodo()}
          />
          <button
            class="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            on:click={addTodo}
          >
            Add task
          </button>
        </div>

        <div class="mt-5 flex flex-wrap gap-2">
          {#each filters as key}
            <button
              class={key === $state.filter
                ? 'rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white'
                : 'rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:border-slate-300 hover:text-slate-700'}
              on:click={() => setFilter(key)}
            >
              {key}
            </button>
          {/each}
        </div>

        <div class="mt-6 space-y-3">
          {#if filteredTodos.length === 0}
            <div
              class="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500"
            >
              Nothing here yet. Add your first task.
            </div>
          {:else}
            {#each filteredTodos as item (item.todo.id)}
              <div
                class="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <input
                  class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                  type="checkbox"
                  checked={item.todo.done}
                  on:change={() => toggleTodo(item.index)}
                />
                <div class="flex-1">
                  <p
                    class={item.todo.done
                      ? 'text-sm text-slate-400 line-through'
                      : 'text-sm text-slate-900'}
                  >
                    {item.todo.title}
                  </p>
                </div>
                <button
                  class="rounded-lg px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-700"
                  on:click={() => removeTodo(item.index)}
                >
                  Remove
                </button>
              </div>
            {/each}
          {/if}
        </div>
      </section>

      <AsyncList />
      <AsyncDetail />
      <AsyncForm />
      <AsyncLongTask />
    </div>
  </div>
</main>
