<script setup lang="ts">
import { oin } from '@oin/store';
import { oinRef } from '@oin/vue';

const count = oin(0);
const countRef = oinRef(count);
</script>

<template>
  <div style="font-family: system-ui; padding: 16px">
    <h1>OIN + Vue</h1>
    <button style="font-size: 16px; padding: 8px 12px" @click="countRef++">
      Count: {{ countRef }}
    </button>
  </div>
</template>
