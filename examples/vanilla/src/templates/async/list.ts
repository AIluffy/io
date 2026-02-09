import { io } from 'io-store';

type Status = 'idle' | 'loading' | 'success' | 'error';
type ItemStatus = 'open' | 'in_progress' | 'done';
type Item = { id: string; title: string; status: ItemStatus };

type SectionHandle = {
  element: HTMLElement;
  destroy: () => void;
};

const baseItems: Item[] = [
  { id: 'a1', title: 'Prepare launch checklist', status: 'open' },
  { id: 'b2', title: 'Sync with design team', status: 'in_progress' },
  { id: 'c3', title: 'Publish release notes', status: 'done' },
];

export function createAsyncListSection(): SectionHandle {
  const store = io({
    status: 'idle' as Status,
    error: '',
    items: [] as Item[],
    lastUpdated: '',
  });

  let requestId = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const section = document.createElement('section');
  section.className =
    'rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200';
  section.innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Async</p>
        <h2 class="mt-2 text-lg font-semibold text-slate-900">Async List</h2>
        <p class="mt-1 text-sm text-slate-500">Fetch remote items with status tracking.</p>
      </div>
      <div class="flex items-center gap-2">
        <span data-status class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          idle
        </span>
        <button
          data-reload
          class="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800"
        >
          Reload
        </button>
      </div>
    </div>
    <div data-body class="mt-6 space-y-3"></div>
  `;

  const statusBadge = section.querySelector('[data-status]');
  const reloadButton = section.querySelector('[data-reload]');
  const body = section.querySelector('[data-body]');

  if (!(statusBadge instanceof HTMLElement)) {
    throw new Error('Missing status badge');
  }
  if (!(reloadButton instanceof HTMLButtonElement)) {
    throw new Error('Missing reload button');
  }
  if (!(body instanceof HTMLElement)) {
    throw new Error('Missing body container');
  }

  const render = () => {
    const snapshot = store.snapshot();
    statusBadge.textContent = snapshot.status;
    reloadButton.disabled = snapshot.status === 'loading';
    reloadButton.className =
      snapshot.status === 'loading'
        ? 'rounded-full bg-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500'
        : 'rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800';

    body.innerHTML = '';

    if (snapshot.status === 'loading') {
      body.innerHTML = `
        <div class="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
          Loading items...
        </div>
      `;
      return;
    }

    if (snapshot.status === 'error') {
      body.innerHTML = `
        <div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
          ${snapshot.error}
        </div>
      `;
      return;
    }

    if (snapshot.items.length === 0) {
      body.innerHTML = `
        <div class="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
          No items yet. Click reload to fetch.
        </div>
      `;
      return;
    }

    const list = document.createElement('div');
    list.className = 'space-y-3';

    snapshot.items.forEach((item) => {
      const row = document.createElement('div');
      row.className =
        'flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3';
      row.innerHTML = `
        <div>
          <p class="text-sm font-semibold text-slate-900">${item.title}</p>
          <p class="mt-1 text-xs text-slate-500">ID: ${item.id}</p>
        </div>
        <span class="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          ${item.status.replace('_', ' ')}
        </span>
      `;
      list.appendChild(row);
    });

    if (snapshot.lastUpdated) {
      const updated = document.createElement('p');
      updated.className = 'text-xs text-slate-400';
      updated.textContent = `Last updated ${snapshot.lastUpdated}`;
      list.appendChild(updated);
    }

    body.appendChild(list);
  };

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
      const nextItems: Item[] = baseItems.map((item) => ({
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

  const onReload = () => load();
  reloadButton.addEventListener('click', onReload);

  const unsubscribe = store.subscribe(render);
  render();

  return {
    element: section,
    destroy: () => {
      reloadButton.removeEventListener('click', onReload);
      if (timer) clearTimeout(timer);
      unsubscribe();
    },
  };
}
