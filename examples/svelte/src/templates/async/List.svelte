<script>
  import { io } from '@iostore/store';
  import { toReadable } from '@iostore/svelte';
  import { onDestroy } from 'svelte';

  const baseItems = [
    { id: 'a1', title: 'Prepare launch checklist', status: 'open' },
    { id: 'b2', title: 'Sync with design team', status: 'in_progress' },
    { id: 'c3', title: 'Publish release notes', status: 'done' },
  ];

  const store = io({
    status: 'idle',
    error: '',
    items: [],
    lastUpdated: '',
  });

  const state = toReadable(store);
  let timer = null;
  let requestId = 0;

  const load = () => {
    requestId += 1;
    const current = requestId;
    store.status.set('loading');
    store.error.set('');

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (current !== requestId) return;
      if (Math.random() < 0.2) {
        store.status.set('error');
        store.error.set('Network error: try again in a moment.');
        return;
      }

      const now = new Date();
      const nextItems = baseItems.map((item) => ({
        ...item,
        status:
          Math.random() < 0.4
            ? 'open'
            : Math.random() < 0.7
              ? 'in_progress'
              : 'done',
      }));
      store.items.commit((draft) => {
        draft.length = 0;
        draft.push(...nextItems);
      });
      store.lastUpdated.set(now.toLocaleTimeString());
      store.status.set('success');
    }, 700 + Math.random() * 800);
  };

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

<section class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        Async
      </p>
      <h2 class="mt-2 text-lg font-semibold text-slate-900">Async List</h2>
      <p class="mt-1 text-sm text-slate-500">
        Fetch remote items with status tracking.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <span
        class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600"
      >
        {$state.status}
      </span>
      <button
        on:click={load}
        disabled={$state.status === 'loading'}
        class={
          $state.status === 'loading'
            ? 'rounded-full bg-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500'
            : 'rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800'
        }
      >
        Reload
      </button>
    </div>
  </div>

  <div class="mt-6 space-y-3">
    {#if $state.status === 'loading'}
      <div
        class="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500"
      >
        Loading items...
      </div>
    {/if}

    {#if $state.status === 'error'}
      <div
        class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700"
      >
        {$state.error}
      </div>
    {/if}

    {#if $state.status !== 'loading' && $state.status !== 'error' && $state.items.length === 0}
      <div
        class="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500"
      >
        No items yet. Click reload to fetch.
      </div>
    {/if}

    {#if $state.items.length > 0 && $state.status !== 'loading' && $state.status !== 'error'}
      <div class="space-y-3">
        {#each $state.items as item}
          <div
            class="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
          >
            <div>
              <p class="text-sm font-semibold text-slate-900">{item.title}</p>
              <p class="mt-1 text-xs text-slate-500">ID: {item.id}</p>
            </div>
            <span
              class="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              {item.status.replace('_', ' ')}
            </span>
          </div>
        {/each}
        {#if $state.lastUpdated}
          <p class="text-xs text-slate-400">Last updated {$state.lastUpdated}</p>
        {/if}
      </div>
    {/if}
  </div>
</section>
