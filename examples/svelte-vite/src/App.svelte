<script>
  import { oin } from '@org/oin';
  import { toWritable } from '@org/oin-svelte';

  const count = oin(0);
  const countStore = toWritable(count);
</script>

<main style="font-family: system-ui; padding: 16px">
  <h1>OIN + Svelte</h1>
  <button
    style="font-size: 16px; padding: 8px 12px"
    on:click={() => countStore.update((v) => v + 1)}
  >
    Count: {$countStore}
  </button>
</main>
