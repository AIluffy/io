<script setup lang="ts">
import { io } from 'io-store';
import { useIO } from 'io-vue';
import { computed, onUnmounted } from 'vue';

type Status = 'idle' | 'submitting' | 'success' | 'error';
type Submission = { name: string; email: string; note: string };

type FormState = { name: string; email: string; note: string };

const store = io({
  status: 'idle' as Status,
  error: '',
  form: { name: '', email: '', note: '' } as FormState,
  lastSubmission: null as Submission | null,
});

const state = useIO(store);
let timer: ReturnType<typeof setTimeout> | null = null;

const name = computed({
  get: () => state.value.form.name,
  set: (value: string) => store.form.name.set(value),
});

const email = computed({
  get: () => state.value.form.email,
  set: (value: string) => store.form.email.set(value),
});

const note = computed({
  get: () => state.value.form.note,
  set: (value: string) => store.form.note.set(value),
});

const submit = () => {
  const currentName = store.form.name.get().trim();
  const currentEmail = store.form.email.get().trim();

  if (!currentName || !currentEmail) {
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
      name: currentName,
      email: currentEmail,
      note: store.form.note.get().trim(),
    });
    store.status.set('success');
  }, 700 + Math.random() * 700);
};

onUnmounted(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <section class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p
          class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
        >
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
        {{ state.status }}
      </span>
    </div>

    <form
      class="mt-6 space-y-4"
      @submit.prevent="submit"
    >
      <input
        v-model="name"
        placeholder="Your name"
        class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      />
      <input
        v-model="email"
        placeholder="Email address"
        class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      />
      <textarea
        v-model="note"
        rows="3"
        placeholder="What should we know?"
        class="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      ></textarea>
      <div class="flex items-center justify-between">
        <p class="text-xs text-slate-500">
          {{
            state.status === 'submitting'
              ? 'Submitting request...'
              : 'We will respond within 24 hours.'
          }}
        </p>
        <button
          type="submit"
          :disabled="state.status === 'submitting'"
          :class="
            state.status === 'submitting'
              ? 'rounded-xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-500'
              : 'rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800'
          "
        >
          Send request
        </button>
      </div>
    </form>

    <div class="mt-5">
      <div
        v-if="state.status === 'error'"
        class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
      >
        {{ state.error }}
      </div>
      <div
        v-else-if="state.status === 'success' && state.lastSubmission"
        class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
      >
        Thanks {{ state.lastSubmission.name }}! We'll follow up at
        {{ state.lastSubmission.email }}.
      </div>
    </div>
  </section>
</template>
