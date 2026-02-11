<script setup lang="ts">
import { io } from 'io-store';
import { useIO } from 'io-vue';
import { computed } from 'vue';
import AsyncDetail from './templates/async/Detail.vue';
import AsyncForm from './templates/async/Form.vue';
import AsyncList from './templates/async/List.vue';
import AsyncLongTask from './templates/async/LongTask.vue';

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
const state = useIO(store);

const draft = computed({
  get: () => state.value.draft,
  set: (value: string) => store.draft.set(value),
});

const filteredTodos = computed(() =>
  state.value.todos.flatMap((todo, index) => {
    if (state.value.filter === 'active' && todo.done) return [];
    if (state.value.filter === 'done' && !todo.done) return [];
    return [{ todo, index }];
  }),
);

const remaining = computed(
  () => state.value.todos.filter((todo) => !todo.done).length,
);

const addTodo = () => {
  const title = state.value.draft.trim();
  if (!title) return;
  store.todos.push({ id: String(Date.now()), title, done: false });
  store.draft.set('');
};

const toggleTodo = (index: number) => {
  store.todos[index].done.set((value) => !value);
};

const removeTodo = (index: number) => {
  store.todos.splice(index, 1);
};
</script>

<template>
  <div class="min-h-screen bg-slate-100">
    <div class="mx-auto max-w-6xl px-6 py-10">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400"
          >
            IO + Vue
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
          {{ remaining }} todo left
        </span>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-2">
        <section
          class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
        >
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p
                class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
              >
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
              {{ remaining }} left
            </span>
          </div>

          <form
            class="mt-6 flex flex-col gap-3 sm:flex-row"
            @submit.prevent="addTodo"
          >
            <input
              v-model="draft"
              placeholder="What needs to be done?"
              class="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <button
              class="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              type="submit"
            >
              Add task
            </button>
          </form>

          <div class="mt-5 flex flex-wrap gap-2">
            <button
              v-for="key in filters"
              :key="key"
              :class="
                key === state.filter
                  ? 'rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white'
                  : 'rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:border-slate-300 hover:text-slate-700'
              "
              @click="store.filter.set(key)"
            >
              {{ key }}
            </button>
          </div>

          <div class="mt-6 space-y-3">
            <div
              v-if="filteredTodos.length === 0"
              class="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500"
            >
              Nothing here yet. Add your first task.
            </div>
            <template v-else>
              <div
                v-for="{ todo, index } in filteredTodos"
                :key="todo.id"
                class="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <input
                  class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                  type="checkbox"
                  :checked="todo.done"
                  @change="toggleTodo(index)"
                />
                <div class="flex-1">
                  <p
                    :class="
                      todo.done
                        ? 'text-sm text-slate-400 line-through'
                        : 'text-sm text-slate-900'
                    "
                  >
                    {{ todo.title }}
                  </p>
                </div>
                <button
                  class="rounded-lg px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-700"
                  @click="removeTodo(index)"
                >
                  Remove
                </button>
              </div>
            </template>
          </div>
        </section>
        <AsyncList />
        <AsyncDetail />
        <AsyncForm />
        <AsyncLongTask />
      </div>
    </div>
  </div>
</template>
