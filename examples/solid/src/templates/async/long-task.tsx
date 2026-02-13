import { io } from '@iostore/store';
import { onCleanup } from 'solid-js';

import { useIO } from '@iostore/solid';

type Status = 'idle' | 'running' | 'done' | 'error';

const taskStore = io({
  status: 'idle' as Status,
  progress: 0,
  message: 'Ready to start.',
});

export function AsyncLongTaskTemplate() {
  const state = useIO(taskStore, { schedule: 'sync' });
  let timer: ReturnType<typeof setInterval> | null = null;

  const startTask = () => {
    if (taskStore.status.get() === 'running') return;
    taskStore.status.set('running');
    taskStore.message.set('Processing batch 1 of 5...');

    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      taskStore.progress.set((value) => {
        const next = Math.min(value + 8, 100);
        if (next >= 100) {
          taskStore.status.set('done');
          taskStore.message.set('All tasks complete.');
          if (timer) clearInterval(timer);
        } else if (next >= 60) {
          taskStore.message.set('Finalizing data merge...');
        } else if (next >= 30) {
          taskStore.message.set('Syncing upstream services...');
        }
        return next;
      });
    }, 320);
  };

  const resetTask = () => {
    if (timer) clearInterval(timer);
    taskStore.status.set('idle');
    taskStore.progress.set(0);
    taskStore.message.set('Ready to start.');
  };

  onCleanup(() => {
    if (timer) clearInterval(timer);
  });

  return (
    <section class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Async
          </p>
          <h2 class="mt-2 text-lg font-semibold text-slate-900">Long Task</h2>
          <p class="mt-1 text-sm text-slate-500">
            Run a background job with progress updates.
          </p>
        </div>
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {state().status}
        </span>
      </div>

      <div class="mt-6">
        <div class="h-2 w-full rounded-full bg-slate-100">
          <div
            class="h-2 rounded-full bg-slate-900"
            style={{ width: `${state().progress}%` }}
          />
        </div>
        <div class="mt-4 flex items-center justify-between">
          <p class="text-sm text-slate-500">{state().message}</p>
          <div class="flex gap-2">
            <button
              onClick={startTask}
              disabled={state().status === 'running'}
              class={
                state().status === 'running'
                  ? 'rounded-full bg-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500'
                  : 'rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800'
              }
            >
              Start
            </button>
            <button
              onClick={resetTask}
              class="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
