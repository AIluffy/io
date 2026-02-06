<script setup lang="ts">
import { createPinia, defineStore, setActivePinia } from 'pinia';

const useCounterStore = defineStore('demo/pinia/counter', {
  state: () => ({ count: 0 }),
  actions: {
    inc() {
      this.count += 1;
    },
  },
});

const pinia = createPinia();
// 每个 island 都创建自己的 Pinia 实例，避免跨请求共享单例。
setActivePinia(pinia);

const store = useCounterStore();
</script>

<template>
  <button type="button" @click="store.inc()">count: {{ store.count }}</button>
</template>
