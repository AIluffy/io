import { io } from '@iostore/store';

type Status = 'idle' | 'loading' | 'success' | 'error';
type Detail = { id: string; name: string; role: string; location: string };

type SectionHandle = {
  element: HTMLElement;
  destroy: () => void;
};

const detailPool: Detail[] = [
  { id: '100', name: 'Avery Chen', role: 'Product Designer', location: 'Remote' },
  { id: '101', name: 'Maya Patel', role: 'Frontend Engineer', location: 'New York' },
  { id: '102', name: 'Luis Ramirez', role: 'QA Lead', location: 'Mexico City' },
];

export function createAsyncDetailSection(): SectionHandle {
  const store = io({
    status: 'idle' as Status,
    error: '',
    query: '100',
    detail: null as Detail | null,
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  let requestId = 0;

  const section = document.createElement('section');
  section.className =
    'rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200';
  section.innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Async</p>
        <h2 class="mt-2 text-lg font-semibold text-slate-900">Async Detail</h2>
        <p class="mt-1 text-sm text-slate-500">Fetch a profile by ID.</p>
      </div>
      <span data-status class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">idle</span>
    </div>

    <div class="mt-6 flex flex-col gap-3 sm:flex-row">
      <input
        data-input
        class="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        placeholder="Profile ID"
      />
      <button
        data-fetch
        class="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Fetch detail
      </button>
    </div>

    <div data-body class="mt-6"></div>
  `;

  const statusBadge = section.querySelector('[data-status]');
  const input = section.querySelector('[data-input]');
  const fetchButton = section.querySelector('[data-fetch]');
  const body = section.querySelector('[data-body]');

  if (!(statusBadge instanceof HTMLElement)) {
    throw new Error('Missing status badge');
  }
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Missing input');
  }
  if (!(fetchButton instanceof HTMLButtonElement)) {
    throw new Error('Missing fetch button');
  }
  if (!(body instanceof HTMLElement)) {
    throw new Error('Missing body container');
  }

  const render = () => {
    const snapshot = store.snapshot();
    statusBadge.textContent = snapshot.status;
    input.value = snapshot.query;
    fetchButton.disabled = snapshot.status === 'loading';
    fetchButton.className =
      snapshot.status === 'loading'
        ? 'rounded-xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-500'
        : 'rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800';

    body.innerHTML = '';

    if (snapshot.status === 'loading') {
      body.innerHTML = `
        <div class="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
          Loading profile...
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

    if (!snapshot.detail) {
      body.innerHTML = `
        <div class="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
          Enter an ID to fetch a profile.
        </div>
      `;
      return;
    }

    const card = document.createElement('div');
    card.className =
      'rounded-xl border border-slate-100 bg-slate-50 px-4 py-4';
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-slate-500">Profile</p>
          <h3 class="mt-1 text-lg font-semibold text-slate-900">${snapshot.detail.name}</h3>
        </div>
        <span class="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">${snapshot.detail.id}</span>
      </div>
      <dl class="mt-4 grid gap-3 text-sm text-slate-600">
        <div class="flex items-center justify-between">
          <dt class="font-semibold text-slate-500">Role</dt>
          <dd>${snapshot.detail.role}</dd>
        </div>
        <div class="flex items-center justify-between">
          <dt class="font-semibold text-slate-500">Location</dt>
          <dd>${snapshot.detail.location}</dd>
        </div>
      </dl>
    `;
    body.appendChild(card);
  };

  const fetchDetail = () => {
    requestId += 1;
    const current = requestId;
    store.status.set('loading');
    store.error.set('');

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (current !== requestId) return;
      const query = store.query.get().trim();
      if (!query) {
        store.status.set('error');
        store.error.set('Please provide a profile ID.');
        return;
      }
      if (query.endsWith('0')) {
        store.status.set('error');
        store.error.set('Profile not found. Try another ID.');
        return;
      }

      const match =
        detailPool.find((item) => item.id === query) ?? detailPool[0];
      store.detail.set({ ...match, id: query });
      store.status.set('success');
    }, 600 + Math.random() * 900);
  };

  const onInput = (event: Event) => {
    const target = event.currentTarget;
    if (target instanceof HTMLInputElement) {
      store.query.set(target.value);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      fetchDetail();
    }
  };

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeyDown);
  fetchButton.addEventListener('click', fetchDetail);

  const unsubscribe = store.subscribe(render);
  render();

  return {
    element: section,
    destroy: () => {
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeyDown);
      fetchButton.removeEventListener('click', fetchDetail);
      if (timer) clearTimeout(timer);
      unsubscribe();
    },
  };
}
