import createJiti from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { io } = await jiti.import('../src/index.ts');

const SNAPSHOT_1K_BUDGET_MS = Number(
  process.env.IO_BUDGET_SNAPSHOT_1K_MS ?? 5,
);
const SCOPE_MEMORY_BUDGET_BYTES_PER_ITER = Number(
  process.env.IO_BUDGET_SCOPE_SPARSE_BYTES_PER_ITER ?? 128,
);
const ARRAY_MEMORY_BUDGET_BYTES_PER_ITER = Number(
  process.env.IO_BUDGET_ARRAY_SPARSE_BYTES_PER_ITER ?? 256,
);

function forceGc(times = 4) {
  if (typeof globalThis.gc !== 'function') {
    throw new Error('perf budget requires node --expose-gc');
  }
  for (let i = 0; i < times; i += 1) globalThis.gc();
}

function buildWideScope(size = 1_000) {
  const scope = {};
  for (let i = 0; i < size; i += 1) scope[`k${i}`] = i;
  return scope;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function runSnapshot1kBudget() {
  const list = io(Array.from({ length: 1_000 }, (_, i) => i));
  for (let i = 0; i < 500; i += 1) {
    const index = i % 1_000;
    list[index].set(i);
    list.snapshot();
  }

  const iterations = 2_000;
  let snapshotElapsed = 0;
  for (let i = 0; i < iterations; i += 1) {
    const index = i % 1_000;
    list[index].set(i + 1_000);
    const start = performance.now();
    list.snapshot();
    snapshotElapsed += performance.now() - start;
  }
  const perOpMs = snapshotElapsed / iterations;

  if (perOpMs > SNAPSHOT_1K_BUDGET_MS) {
    throw new Error(
      `snapshot budget exceeded: 1k array snapshot ${perOpMs.toFixed(3)}ms/op > ${SNAPSHOT_1K_BUDGET_MS}ms/op`,
    );
  }

  return perOpMs;
}

function measureBytesPerIteration(name, iterations, setup, step, samples = 5) {
  const deltas = [];

  for (let sample = 0; sample < samples; sample += 1) {
    const target = setup();

    for (let i = 0; i < 200; i += 1) step(target, i);

    forceGc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < iterations; i += 1) step(target, i);
    forceGc();
    const after = process.memoryUsage().heapUsed;
    deltas.push(Math.max(0, after - before));
  }

  const medianDelta = median(deltas);
  return {
    name,
    bytesPerIteration: medianDelta / iterations,
  };
}

function runMemoryBudgets() {
  const scope = measureBytesPerIteration(
    'scope sparse dirty + snapshot (1k)',
    2_000,
    () => io(buildWideScope(1_000)),
    (store, i) => {
      const key = `k${i % 1_000}`;
      store[key].set(i);
      store.snapshot();
    },
  );

  const array = measureBytesPerIteration(
    'array sparse dirty + snapshot (1k)',
    2_000,
    () => io(Array.from({ length: 1_000 }, (_, i) => i)),
    (list, i) => {
      const index = i % 1_000;
      list[index].set(i);
      list.snapshot();
    },
  );

  if (scope.bytesPerIteration > SCOPE_MEMORY_BUDGET_BYTES_PER_ITER) {
    throw new Error(
      `${scope.name} budget exceeded: ${scope.bytesPerIteration.toFixed(2)} bytes/iter > ${SCOPE_MEMORY_BUDGET_BYTES_PER_ITER}`,
    );
  }

  if (array.bytesPerIteration > ARRAY_MEMORY_BUDGET_BYTES_PER_ITER) {
    throw new Error(
      `${array.name} budget exceeded: ${array.bytesPerIteration.toFixed(2)} bytes/iter > ${ARRAY_MEMORY_BUDGET_BYTES_PER_ITER}`,
    );
  }

  return {
    scopeBytesPerIter: scope.bytesPerIteration,
    arrayBytesPerIter: array.bytesPerIteration,
  };
}

const snapshot1kMs = runSnapshot1kBudget();
const memory = runMemoryBudgets();

console.log(
  JSON.stringify(
    {
      snapshot1kMs: Number(snapshot1kMs.toFixed(4)),
      snapshot1kBudgetMs: SNAPSHOT_1K_BUDGET_MS,
      scopeSparseSnapshotBytesPerIter: Number(
        memory.scopeBytesPerIter.toFixed(2),
      ),
      scopeSparseBudgetBytesPerIter: SCOPE_MEMORY_BUDGET_BYTES_PER_ITER,
      arraySparseSnapshotBytesPerIter: Number(
        memory.arrayBytesPerIter.toFixed(2),
      ),
      arraySparseBudgetBytesPerIter: ARRAY_MEMORY_BUDGET_BYTES_PER_ITER,
    },
    null,
    2,
  ),
);
