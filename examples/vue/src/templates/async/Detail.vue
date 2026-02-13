<script setup lang="ts">
import { io } from '@iostore/store';
import { useIO } from '@iostore/vue';
import { computed, onUnmounted } from 'vue';

type Status = 'idle' | 'loading' | 'success' | 'error';
type Detail = { id: string; name: string; role: string; location: string };

const detailPool: Detail[] = [
  { id: '100', name: 'Avery Chen', role: 'Product Designer', location: 'Remote' },
  { id: '101', name: 'Maya Patel', role: 'Frontend Engineer', location: 'New York' },
  { id: '102', name: 'Luis Ramirez', role: 'QA Lead', location: 'Mexico City' },
];

const store = io({
  status: 'idle' as Status,
  error: '',
  query: '100',
  detail: null as Detail | null,
});

const state = useIO(store);
let timer: ReturnType<typeof setTimeout> | null = null;
let requestId = 0;

const query = computed({
  get: () => state.value.query,
  set: (value: string) => store.query.set(value),
});

const fetchDetail = () => {
  requestId += 1;
  const current = requestId;
  store.status.set('loading');
  store.error.set('');

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (current !== requestId) return;
    const currentQuery = store.query.get().trim();
    if (!currentQuery) {
      store.status.set('error');
      store.error.set('Please provide a profile ID.');
      return;
    }
    if (currentQuery.endsWith('0')) {
      store.status.set('error');
      store.error.set('Profile not found. Try another ID.');
      return;
    }

    const match = detailPool.find((item) => item.id === currentQuery) ?? detailPool[0];
    store.detail.set({ ...match, id: currentQuery });
    store.status.set('success');
  }, 600 + Math.random() * 900);
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
        <h2 class="mt-2 text-lg font-semibold text-slate-900">
          Async Detail
        </h2>
        <p class="mt-1 text-sm text-slate-500">Fetch a profile by ID.</p>
      </div>
      <span
        class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600"
      >
        {{ state.status }}
      </span>
    </div>

    <div class="mt-6 flex flex-col gap-3 sm:flex-row">
      <input
        v-model="query"
        placeholder="Profile ID"
        class="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        @keydown.enter="fetchDetail"
      />
      <button
        :disabled="state.status === 'loading'"
        :class="
          state.status === 'loading'
            ? 'rounded-xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-500'
            : 'rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800'
        "
        @click="fetchDetail"
      >
        Fetch detail
      </button>
    </div>

    <div class="mt-6">
      <div
        v-if="state.status === 'loading'"
        class="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500"
      >
        Loading profile...
      </div>

      <div
        v-else-if="state.status === 'error'"
        class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700"
      >
        {{ state.error }}
      </div>

      <div
        v-else-if="!state.detail"
        class="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500"
      >
        Enter an ID to fetch a profile.
      </div>

      <div
        v-else
        class="rounded-xl border border-slate-100 bg-slate-50 px-4 py-4"
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-slate-500">Profile</p>
            <h3 class="mt-1 text-lg font-semibold text-slate-900">
              {{ state.detail.name }}
            </h3>
          </div>
          <span
            class="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {{ state.detail.id }}
          </span>
        </div>
        <dl class="mt-4 grid gap-3 text-sm text-slate-600">
          <div class="flex items-center justify-between">
            <dt class="font-semibold text-slate-500">Role</dt>
            <dd>{{ state.detail.role }}</dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="font-semibold text-slate-500">Location</dt>
            <dd>{{ state.detail.location }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>
