<script>
  import { io } from '@iostore/store';
  import { toReadable } from '@iostore/svelte';
  import { onDestroy } from 'svelte';

  const store = io({
    status: 'idle',
    error: '',
    form: {
      name: '',
      email: '',
      note: '',
    },
    lastSubmission: null,
  });

  const state = toReadable(store);
  let timer = null;

  const submit = (event) => {
    event.preventDefault();
    const name = store.form.name.get().trim();
    const email = store.form.email.get().trim();

    if (!name || !email) {
      store.status.set('error');
      store.error.set('Name and email are required.');
      return;
    }

    store.status.set('submitting');
    store.error.set('');

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (Math.random() < 0.2) {
        store.status.set('error');
        store.error.set('Submission failed. Please retry.');
        return;
      }

      store.lastSubmission.set({
        name,
        email,
        note: store.form.note.get().trim(),
      });
      store.status.set('success');
    }, 700 + Math.random() * 700);
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
      <h2 class="mt-2 text-lg font-semibold text-slate-900">Async Form</h2>
      <p class="mt-1 text-sm text-slate-500">
        Submit a request with optimistic UI.
      </p>
    </div>
    <span
      class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600"
    >
      {$state.status}
    </span>
  </div>

  <form class="mt-6 space-y-4" on:submit={submit}>
    <input
      value={$state.form.name}
      on:input={(event) => store.form.name.set(event.currentTarget.value)}
      placeholder="Your name"
      class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
    />
    <input
      value={$state.form.email}
      on:input={(event) => store.form.email.set(event.currentTarget.value)}
      placeholder="Email address"
      class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
    />
    <textarea
      rows="3"
      value={$state.form.note}
      on:input={(event) => store.form.note.set(event.currentTarget.value)}
      placeholder="What should we know?"
      class="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
    ></textarea>
    <div class="flex items-center justify-between">
      <p class="text-xs text-slate-500">
        {$state.status === 'submitting'
          ? 'Submitting request...'
          : 'We will respond within 24 hours.'}
      </p>
      <button
        type="submit"
        disabled={$state.status === 'submitting'}
        class={
          $state.status === 'submitting'
            ? 'rounded-xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-500'
            : 'rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800'
        }
      >
        Send request
      </button>
    </div>
  </form>

  <div class="mt-5">
    {#if $state.status === 'error'}
      <div
        class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
      >
        {$state.error}
      </div>
    {/if}
    {#if $state.status === 'success' && $state.lastSubmission}
      <div
        class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
      >
        Thanks {$state.lastSubmission.name}! We'll follow up at
        {$state.lastSubmission.email}.
      </div>
    {/if}
  </div>
</section>
