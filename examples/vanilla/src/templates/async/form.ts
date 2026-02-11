import { io } from 'io-store';

type Status = 'idle' | 'submitting' | 'success' | 'error';
type Submission = { name: string; email: string; note: string };

type SectionHandle = {
  element: HTMLElement;
  destroy: () => void;
};

export function createAsyncFormSection(): SectionHandle {
  const store = io({
    status: 'idle' as Status,
    error: '',
    form: {
      name: '',
      email: '',
      note: '',
    },
    lastSubmission: null as Submission | null,
  });

  let timer: ReturnType<typeof setTimeout> | null = null;

  const section = document.createElement('section');
  section.className =
    'rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200';
  section.innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Async</p>
        <h2 class="mt-2 text-lg font-semibold text-slate-900">Async Form</h2>
        <p class="mt-1 text-sm text-slate-500">Submit a request with optimistic UI.</p>
      </div>
      <span data-status class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">idle</span>
    </div>

    <form data-form class="mt-6 space-y-4">
      <input
        data-name
        class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        placeholder="Your name"
      />
      <input
        data-email
        class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        placeholder="Email address"
      />
      <textarea
        data-note
        rows="3"
        class="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        placeholder="What should we know?"
      ></textarea>
      <div class="flex items-center justify-between">
        <p data-helper class="text-xs text-slate-500"></p>
        <button
          data-submit
          type="submit"
          class="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Send request
        </button>
      </div>
    </form>

    <div data-result class="mt-5"></div>
  `;

  const statusBadge = section.querySelector('[data-status]');
  const form = section.querySelector('[data-form]');
  const nameInput = section.querySelector('[data-name]');
  const emailInput = section.querySelector('[data-email]');
  const noteInput = section.querySelector('[data-note]');
  const helper = section.querySelector('[data-helper]');
  const submitButton = section.querySelector('[data-submit]');
  const result = section.querySelector('[data-result]');

  if (!(statusBadge instanceof HTMLElement)) {
    throw new Error('Missing status badge');
  }
  if (!(form instanceof HTMLFormElement)) {
    throw new Error('Missing form');
  }
  if (!(nameInput instanceof HTMLInputElement)) {
    throw new Error('Missing name input');
  }
  if (!(emailInput instanceof HTMLInputElement)) {
    throw new Error('Missing email input');
  }
  if (!(noteInput instanceof HTMLTextAreaElement)) {
    throw new Error('Missing note input');
  }
  if (!(helper instanceof HTMLElement)) {
    throw new Error('Missing helper');
  }
  if (!(submitButton instanceof HTMLButtonElement)) {
    throw new Error('Missing submit button');
  }
  if (!(result instanceof HTMLElement)) {
    throw new Error('Missing result container');
  }

  const render = () => {
    const snapshot = store.snapshot();
    statusBadge.textContent = snapshot.status;
    nameInput.value = snapshot.form.name;
    emailInput.value = snapshot.form.email;
    noteInput.value = snapshot.form.note;

    const isSubmitting = snapshot.status === 'submitting';
    submitButton.disabled = isSubmitting;
    submitButton.className =
      isSubmitting
        ? 'rounded-xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-500'
        : 'rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800';
    helper.textContent = isSubmitting
      ? 'Submitting request...'
      : 'We will respond within 24 hours.';

    result.innerHTML = '';

    if (snapshot.status === 'error') {
      result.innerHTML = `
        <div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          ${snapshot.error}
        </div>
      `;
      return;
    }

    if (snapshot.status === 'success' && snapshot.lastSubmission) {
      result.innerHTML = `
        <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Thanks ${snapshot.lastSubmission.name}! We'll follow up at ${snapshot.lastSubmission.email}.
        </div>
      `;
    }
  };

  const updateField = (key: 'name' | 'email' | 'note', value: string) => {
    store.form[key].set(value);
  };

  const onSubmit = (event: Event) => {
    event.preventDefault();
    const snapshot = store.snapshot();
    const name = snapshot.form.name.trim();
    const email = snapshot.form.email.trim();

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
        note: snapshot.form.note.trim(),
      });
      store.status.set('success');
    }, 700 + Math.random() * 700);
  };

  nameInput.addEventListener('input', (event) => {
    if (event.currentTarget instanceof HTMLInputElement) {
      updateField('name', event.currentTarget.value);
    }
  });
  emailInput.addEventListener('input', (event) => {
    if (event.currentTarget instanceof HTMLInputElement) {
      updateField('email', event.currentTarget.value);
    }
  });
  noteInput.addEventListener('input', (event) => {
    if (event.currentTarget instanceof HTMLTextAreaElement) {
      updateField('note', event.currentTarget.value);
    }
  });
  form.addEventListener('submit', onSubmit);

  const unsubscribe = store.subscribe(render);
  render();

  return {
    element: section,
    destroy: () => {
      form.removeEventListener('submit', onSubmit);
      if (timer) clearTimeout(timer);
      unsubscribe();
    },
  };
}
