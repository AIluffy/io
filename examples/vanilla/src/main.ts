import './index.css';
import { createAsyncDetailSection } from './templates/async/detail';
import { createAsyncFormSection } from './templates/async/form';
import { createAsyncListSection } from './templates/async/list';
import { createAsyncLongTaskSection } from './templates/async/long-task';
import { createTodoSection, todoStore } from './templates/todo';

const app = document.getElementById('app');
if (!app) {
  throw new Error('Missing #app element');
}

const wrapper = document.createElement('div');
wrapper.className = 'min-h-screen bg-slate-100';
wrapper.innerHTML = `
  <div class="mx-auto max-w-6xl px-6 py-10">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">IO + Vanilla</p>
        <h1 class="mt-2 text-3xl font-semibold text-slate-900">Examples Gallery</h1>
        <p class="mt-2 text-sm text-slate-500">
          Sync and async patterns built with Units and Tree updates.
        </p>
      </div>
      <span
        data-remaining
        class="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200"
      ></span>
    </div>
    <div data-grid class="mt-8 grid gap-6 lg:grid-cols-2"></div>
  </div>
`;

app.append(wrapper);

const grid = wrapper.querySelector('[data-grid]');
if (!grid) {
  throw new Error('Missing grid container');
}

const sections = [
  createTodoSection(),
  createAsyncListSection(),
  createAsyncDetailSection(),
  createAsyncFormSection(),
  createAsyncLongTaskSection(),
];

sections.forEach(({ element }) => grid.appendChild(element));

const remainingBadge = wrapper.querySelector('[data-remaining]');
const updateRemaining = () => {
  if (!remainingBadge) return;
  const state = todoStore.snapshot();
  const remaining = state.todos.filter((todo) => !todo.done).length;
  remainingBadge.textContent = `${remaining} todo left`;
};

const unsubscribeRemaining = todoStore.subscribe(updateRemaining);
updateRemaining();

window.addEventListener('beforeunload', () => {
  unsubscribeRemaining();
  sections.forEach(({ destroy }) => destroy());
});
