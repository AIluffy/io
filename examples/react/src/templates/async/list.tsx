import { io } from 'io-store';
import { useIO } from 'io-react';
import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

type Status = 'idle' | 'loading' | 'success' | 'error';
type ItemStatus = 'open' | 'in_progress' | 'done';
type Item = { id: string; title: string; status: ItemStatus };

const baseItems: Item[] = [
  { id: 'a1', title: 'Prepare launch checklist', status: 'open' },
  { id: 'b2', title: 'Sync with design team', status: 'in_progress' },
  { id: 'c3', title: 'Publish release notes', status: 'done' },
];

const listStore = io({
  status: 'idle' as Status,
  error: '',
  items: [] as Item[],
  lastUpdated: '',
});

export function AsyncListTemplate(): ReactElement {
  const state = useIO(listStore);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);

  const load = () => {
    requestRef.current += 1;
    const current = requestRef.current;
    listStore.status.set('loading');
    listStore.error.set('');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (current !== requestRef.current) return;
      if (Math.random() < 0.2) {
        listStore.status.set('error');
        listStore.error.set('Network error: try again in a moment.');
        return;
      }

      const now = new Date();
      const nextItems: Item[] = baseItems.map((item) => ({
        ...item,
        status:
          Math.random() < 0.4
            ? 'open'
            : Math.random() < 0.7
              ? 'in_progress'
              : 'done',
      }));
      listStore.items.commit((draft) => {
        draft.length = 0;
        draft.push(...nextItems);
      });
      listStore.lastUpdated.set(now.toLocaleTimeString());
      listStore.status.set('success');
    }, 700 + Math.random() * 800);
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
            Async List
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Fetch remote items with status tracking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            {state.status}
          </span>
          <button
            onClick={load}
            disabled={state.status === 'loading'}
            className={
              state.status === 'loading'
                ? 'rounded-full bg-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500'
                : 'rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800'
            }
          >
            Reload
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {state.status === 'loading' && (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            Loading items...
          </div>
        )}

        {state.status === 'error' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            {state.error}
          </div>
        )}

        {state.status !== 'loading' && state.status !== 'error' &&
        state.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            No items yet. Click reload to fetch.
          </div>
        ) : null}

        {state.items.length > 0 && state.status !== 'loading' &&
        state.status !== 'error' ? (
          <div className="space-y-3">
            {state.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">ID: {item.id}</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {item.status.replace('_', ' ')}
                </span>
              </div>
            ))}
            {state.lastUpdated ? (
              <p className="text-xs text-slate-400">
                Last updated {state.lastUpdated}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
