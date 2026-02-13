<script>
  import { io } from '@iostore/store';
  import { toReadable } from '@iostore/svelte';
  import { onDestroy } from 'svelte';

  const store = io({
    status: 'idle',
    progress: 0,
    message: 'Ready to start.',
  });

  const state = toReadable(store);
  let timer = null;

  const startTask = () => {
    if (store.status.get() === 'running') return;
    store.status.set('running');
    store.message.set('Processing batch 1 of 5...');

    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      store.progress.set((value) => {
        const next = Math.min(value + 8, 100);
        if (next >= 100) {
          store.status.set('done');
          store.message.set('All tasks complete.');
          if (timer) clearInterval(timer);
        } else if (next >= 60) {
          store.message.set('Finalizing data merge...');
        } else if (next >= 30) {
          store.message.set('Syncing upstream services...');
        }
        return next;
      });
    }, 320);
  };

  const resetTask = () => {
    if (timer) clearInterval(timer);
    store.status.set('idle');
    store.progress.set(0);
    store.message.set('Ready to start.');
  };

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

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
    <span
      class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600"
    >
      {$state.status}
    </span>
  </div>

  <div class="mt-6">
    <div class="h-2 w-full rounded-full bg-slate-100">
      <div
        class="h-2 rounded-full bg-slate-900"
        style="width: {$state.progress}%"
      ></div>
    </div>
    <div class="mt-4 flex items-center justify-between">
      <p class="text-sm text-slate-500">{$state.message}</p>
      <div class="flex gap-2">
        <button
          on:click={startTask}
          disabled={$state.status === 'running'}
          class={
            $state.status === 'running'
              ? 'rounded-full bg-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500'
              : 'rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800'
          }
        >
          Start
        </button>
        <button
          on:click={resetTask}
          class="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
        >
          Reset
        </button>
      </div>
    </div>
  </div>
</section>
