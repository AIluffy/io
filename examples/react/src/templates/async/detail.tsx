import { io } from '@iostore/store';
import { useIO } from '@iostore/react';
import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

type Status = 'idle' | 'loading' | 'success' | 'error';
type Detail = { id: string; name: string; role: string; location: string };

const detailPool: Detail[] = [
  { id: '100', name: 'Avery Chen', role: 'Product Designer', location: 'Remote' },
  { id: '101', name: 'Maya Patel', role: 'Frontend Engineer', location: 'New York' },
  { id: '102', name: 'Luis Ramirez', role: 'QA Lead', location: 'Mexico City' },
];

const detailStore = io({
  status: 'idle' as Status,
  error: '',
  query: '100',
  detail: null as Detail | null,
});

export function AsyncDetailTemplate(): ReactElement {
  const state = useIO(detailStore);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);

  const fetchDetail = () => {
    requestRef.current += 1;
    const current = requestRef.current;
    detailStore.status.set('loading');
    detailStore.error.set('');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (current !== requestRef.current) return;
      const query = detailStore.query.get().trim();
      if (!query) {
        detailStore.status.set('error');
        detailStore.error.set('Please provide a profile ID.');
        return;
      }
      if (query.endsWith('0')) {
        detailStore.status.set('error');
        detailStore.error.set('Profile not found. Try another ID.');
        return;
      }

      const match = detailPool.find((item) => item.id === query) ?? detailPool[0];
      detailStore.detail.set({ ...match, id: query });
      detailStore.status.set('success');
    }, 600 + Math.random() * 900);
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
            Async Detail
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Fetch a profile by ID.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {state.status}
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={state.query}
          onChange={(event) => detailStore.query.set(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && fetchDetail()}
          placeholder="Profile ID"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <button
          onClick={fetchDetail}
          disabled={state.status === 'loading'}
          className={
            state.status === 'loading'
              ? 'rounded-xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-500'
              : 'rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800'
          }
        >
          Fetch detail
        </button>
      </div>

      <div className="mt-6">
        {state.status === 'loading' && (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            Loading profile...
          </div>
        )}

        {state.status === 'error' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            {state.error}
          </div>
        )}

        {state.status !== 'loading' && state.status !== 'error' && !state.detail && (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            Enter an ID to fetch a profile.
          </div>
        )}

        {state.detail && state.status !== 'loading' && state.status !== 'error' ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Profile</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  {state.detail.name}
                </h3>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {state.detail.id}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <dt className="font-semibold text-slate-500">Role</dt>
                <dd>{state.detail.role}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="font-semibold text-slate-500">Location</dt>
                <dd>{state.detail.location}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </section>
  );
}
