import { io } from 'io-store';

type Status = 'idle' | 'running' | 'done' | 'error';

type SectionHandle = {
  element: HTMLElement;
  destroy: () => void;
};

export function createAsyncLongTaskSection(): SectionHandle {
  const store = io({
    status: 'idle' as Status,
    progress: 0,
    message: '',
  });

  let timer: ReturnType<typeof setInterval> | null = null;

  const section = document.createElement('section');
  section.className =
    'rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200';
  section.innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Async</p>
        <h2 class="mt-2 text-lg font-semibold text-slate-900">Long Task</h2>
        <p class="mt-1 text-sm text-slate-500">Run a background job with progress updates.</p>
      </div>
      <span data-status class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">idle</span>
    </div>

    <div class="mt-6">
      <div class="h-2 w-full rounded-full bg-slate-100">
        <div data-bar class="h-2 rounded-full bg-slate-900" style="width: 0%"></div>
      </div>
      <div class="mt-4 flex items-center justify-between">
        <p data-message class="text-sm text-slate-500">Ready to start.</p>
        <div class="flex gap-2">
          <button
            data-start
            class="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800"
          >
            Start
          </button>
          <button
            data-reset
            class="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  `;

  const statusBadge = section.querySelector('[data-status]');
  const progressBar = section.querySelector('[data-bar]');
  const message = section.querySelector('[data-message]');
  const startButton = section.querySelector('[data-start]');
  const resetButton = section.querySelector('[data-reset]');

  if (!(statusBadge instanceof HTMLElement)) {
    throw new Error('Missing status badge');
  }
  if (!(progressBar instanceof HTMLElement)) {
    throw new Error('Missing progress bar');
  }
  if (!(message instanceof HTMLElement)) {
    throw new Error('Missing message');
  }
  if (!(startButton instanceof HTMLButtonElement)) {
    throw new Error('Missing start button');
  }
  if (!(resetButton instanceof HTMLButtonElement)) {
    throw new Error('Missing reset button');
  }

  const render = () => {
    const snapshot = store.snapshot();
    statusBadge.textContent = snapshot.status;
    progressBar.style.width = `${snapshot.progress}%`;
    message.textContent = snapshot.message;

    startButton.disabled = snapshot.status === 'running';
    startButton.className =
      snapshot.status === 'running'
        ? 'rounded-full bg-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500'
        : 'rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800';
  };

  const startTask = () => {
    if (store.status.get() === 'running') return;
    store.status.set('running');
    store.message.set('Processing batch 1 of 5...');

    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      store.progress.update((value) => {
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

  startButton.addEventListener('click', startTask);
  resetButton.addEventListener('click', resetTask);

  const unsubscribe = store.subscribe(render);
  render();

  return {
    element: section,
    destroy: () => {
      startButton.removeEventListener('click', startTask);
      resetButton.removeEventListener('click', resetTask);
      if (timer) clearInterval(timer);
      unsubscribe();
    },
  };
}
