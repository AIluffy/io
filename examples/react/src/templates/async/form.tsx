import { io } from 'io-store';
import { useIO } from 'io-react';
import { useEffect, useRef } from 'react';
import type { FormEvent, ReactElement } from 'react';

type Status = 'idle' | 'submitting' | 'success' | 'error';
type Submission = { name: string; email: string; note: string };

type FormState = { name: string; email: string; note: string };

const formStore = io({
  status: 'idle' as Status,
  error: '',
  form: { name: '', email: '', note: '' } as FormState,
  lastSubmission: null as Submission | null,
});

export function AsyncFormTemplate(): ReactElement {
  const state = useIO(formStore);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submit = (event?: FormEvent<HTMLFormElement>) => {
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

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
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

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Async
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">
            Async Form
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Submit a request with optimistic UI.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {state.status}
        </span>
      </div>

      <form className="mt-6 space-y-4" onSubmit={submit}>
        <input
          value={state.form.name}
          onChange={(event) => formStore.form.name.set(event.target.value)}
          placeholder="Your name"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <input
          value={state.form.email}
          onChange={(event) => formStore.form.email.set(event.target.value)}
          placeholder="Email address"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <textarea
          value={state.form.note}
          onChange={(event) => formStore.form.note.set(event.target.value)}
          rows={3}
          placeholder="What should we know?"
          className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {state.status === 'submitting'
              ? 'Submitting request...'
              : 'We will respond within 24 hours.'}
          </p>
          <button
            type="submit"
            disabled={state.status === 'submitting'}
            className={
              state.status === 'submitting'
                ? 'rounded-xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-500'
                : 'rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800'
            }
          >
            Send request
          </button>
        </div>
      </form>

      <div className="mt-5">
        {state.status === 'error' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {state.error}
          </div>
        )}
        {state.status === 'success' && state.lastSubmission && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Thanks {state.lastSubmission.name}! We'll follow up at{' '}
            {state.lastSubmission.email}.
          </div>
        )}
      </div>
    </section>
  );
}
