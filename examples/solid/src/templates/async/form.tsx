import { io } from 'io-store';
import { onCleanup } from 'solid-js';

import { useIO } from 'io-solid';

type Status = 'idle' | 'submitting' | 'success' | 'error';
type Submission = { name: string; email: string; note: string };
type FormState = { name: string; email: string; note: string };

const formStore = io({
  status: 'idle' as Status,
  error: '',
  form: { name: '', email: '', note: '' } as FormState,
  lastSubmission: null as Submission | null,
});

export function AsyncFormTemplate() {
  const state = useIO(formStore, { schedule: 'sync' });
  let timer: ReturnType<typeof setTimeout> | null = null;

  const submit = (event?: SubmitEvent) => {
    event?.preventDefault();
    const name = formStore.form.name.get().trim();
    const email = formStore.form.email.get().trim();

    if (!name || !email) {
      formStore.status.set('error');
      formStore.error.set('Name and email are required.');
      return;
    }

    formStore.status.set('submitting');
    formStore.error.set('');

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (Math.random() < 0.2) {
        formStore.status.set('error');
        formStore.error.set('Submission failed. Please retry.');
        return;
      }

      formStore.lastSubmission.set({
        name,
        email,
        note: formStore.form.note.get().trim(),
      });
      formStore.status.set('success');
    }, 700 + Math.random() * 700);
  };

  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  return (
    <section class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Async
          </p>
          <h2 class="mt-2 text-lg font-semibold text-slate-900">Async Form</h2>
          <p class="mt-1 text-sm text-slate-500">Submit a request with optimistic UI.</p>
        </div>
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {state().status}
        </span>
      </div>

      <form
        class="mt-6 space-y-4"
        onSubmit={(event) => submit(event as unknown as SubmitEvent)}
      >
        <input
          value={state().form.name}
          onInput={(event) => formStore.form.name.set(event.currentTarget.value)}
          placeholder="Your name"
          class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <input
          value={state().form.email}
          onInput={(event) => formStore.form.email.set(event.currentTarget.value)}
          placeholder="Email address"
          class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <textarea
          value={state().form.note}
          onInput={(event) => formStore.form.note.set(event.currentTarget.value)}
          rows={3}
          placeholder="What should we know?"
          class="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <div class="flex items-center justify-between">
          <p class="text-xs text-slate-500">
            {state().status === 'submitting'
              ? 'Submitting request...'
              : 'We will respond within 24 hours.'}
          </p>
          <button
            type="submit"
            disabled={state().status === 'submitting'}
            class={
              state().status === 'submitting'
                ? 'rounded-xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-500'
                : 'rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800'
            }
          >
            Send request
          </button>
        </div>
      </form>

      <div class="mt-5">
        {state().status === 'error' ? (
          <div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {state().error}
          </div>
        ) : null}
        {state().status === 'success' && state().lastSubmission ? (
          <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Thanks {state().lastSubmission?.name}! We'll follow up at{' '}
            {state().lastSubmission?.email}.
          </div>
        ) : null}
      </div>
    </section>
  );
}
