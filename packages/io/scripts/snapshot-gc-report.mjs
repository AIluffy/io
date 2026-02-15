import createJiti from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { io } = await jiti.import('../src/lib/core/io.ts');
const jsonMode = process.argv.includes('--json');

function forceGc(times = 4) {
  if (typeof globalThis.gc !== 'function') return;
  for (let i = 0; i < times; i += 1) globalThis.gc();
}

function buildWideScope(size = 1_000) {
  const scope = {};
  for (let i = 0; i < size; i += 1) scope[`k${i}`] = i;
  return scope;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function mean(values) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function measure(name, iterations, setup, step, samples = 5) {
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

  const heapDeltaBytes = median(deltas);
  const p75HeapDeltaBytes = percentile(deltas, 75);
  const meanHeapDeltaBytes = mean(deltas);
  const medianBytesPerIteration = Number((heapDeltaBytes / iterations).toFixed(2));
  const meanBytesPerIteration = Number(
    (meanHeapDeltaBytes / iterations).toFixed(2),
  );
  const p75BytesPerIteration = Number(
    (p75HeapDeltaBytes / iterations).toFixed(2),
  );
  const stableBytesPerIteration =
    medianBytesPerIteration === 0 && meanBytesPerIteration > 0
      ? meanBytesPerIteration
      : medianBytesPerIteration;

  return {
    scenario: name,
    iterations,
    samples,
    heapDeltaBytes,
    meanHeapDeltaBytes,
    p75HeapDeltaBytes,
    bytesPerIteration: medianBytesPerIteration,
    meanBytesPerIteration,
    p75BytesPerIteration,
    stableBytesPerIteration,
  };
}

if (typeof globalThis.gc !== 'function') {
  console.error('GC report requires node --expose-gc');
  process.exit(1);
}

const results = [
  measure(
    'scope: clean snapshot hit (10k)',
    10_000,
    () => {
      const store = io(buildWideScope(1_000));
      store.snapshot();
      return store;
    },
    (store) => {
      store.snapshot();
    },
  ),
  measure(
    'scope: sparse dirty set-only (2k)',
    2_000,
    () => io(buildWideScope(1_000)),
    (store, i) => {
      const key = `k${i % 1_000}`;
      store[key].set(i);
    },
  ),
  measure(
    'scope: sparse dirty set-only cached-handle (2k)',
    2_000,
    () => {
      const store = io(buildWideScope(1_000));
      const handles = Array.from(
        { length: 1_000 },
        (_, i) => store[`k${i}`],
      );
      return { handles };
    },
    ({ handles }, i) => {
      const index = i % 1_000;
      handles[index].set(i);
    },
  ),
  measure(
    'scope: sparse dirty + snapshot (2k)',
    2_000,
    () => io(buildWideScope(1_000)),
    (store, i) => {
      const key = `k${i % 1_000}`;
      store[key].set(i);
      store.snapshot();
    },
  ),
  measure(
    'scope: dense dirty + snapshot (20 rounds)',
    20,
    () => io(buildWideScope(1_000)),
    (store, round) => {
      for (let i = 0; i < 1_000; i += 1) {
        store[`k${i}`].set(i + round);
      }
      store.snapshot();
    },
  ),
  measure(
    'array: clean snapshot hit (10k)',
    10_000,
    () => {
      const list = io(Array.from({ length: 1_000 }, (_, i) => i));
      list.snapshot();
      return list;
    },
    (list) => {
      list.snapshot();
    },
  ),
  measure(
    'array: sparse dirty set-only (2k)',
    2_000,
    () => io(Array.from({ length: 1_000 }, (_, i) => i)),
    (list, i) => {
      const index = i % 1_000;
      list[index].set(i);
    },
  ),
  measure(
    'array: sparse dirty set-only cached-handle (2k)',
    2_000,
    () => {
      const list = io(Array.from({ length: 1_000 }, (_, i) => i));
      const handles = Array.from({ length: 1_000 }, (_, i) => list[i]);
      return { handles };
    },
    ({ handles }, i) => {
      const index = i % 1_000;
      handles[index].set(i);
    },
  ),
  measure(
    'array: sparse dirty + snapshot (2k)',
    2_000,
    () => io(Array.from({ length: 1_000 }, (_, i) => i)),
    (list, i) => {
      const index = i % 1_000;
      list[index].set(i);
      list.snapshot();
    },
  ),
  measure(
    'array: dense dirty + snapshot (20 rounds)',
    20,
    () => io(Array.from({ length: 1_000 }, (_, i) => i)),
    (list, round) => {
      for (let i = 0; i < 1_000; i += 1) {
        list[i].set(i + round);
      }
      list.snapshot();
    },
  ),
];

const byScenario = new Map(results.map((row) => [row.scenario, row]));
const scopeSparseSet = byScenario.get('scope: sparse dirty set-only (2k)');
const scopeSparseCombined = byScenario.get('scope: sparse dirty + snapshot (2k)');
const arraySparseSet = byScenario.get('array: sparse dirty set-only (2k)');
const arraySparseCombined = byScenario.get('array: sparse dirty + snapshot (2k)');

const approximations = [];
if (scopeSparseSet && scopeSparseCombined) {
  approximations.push({
    scenario: 'scope: sparse dirty snapshot-only (estimated)',
    bytesPerIteration: Number(
      Math.max(
        0,
        scopeSparseCombined.stableBytesPerIteration -
          scopeSparseSet.stableBytesPerIteration,
      ).toFixed(2),
    ),
    sourceMetric: 'stableBytesPerIteration',
    method: 'combined - set-only',
  });
}
if (arraySparseSet && arraySparseCombined) {
  approximations.push({
    scenario: 'array: sparse dirty snapshot-only (estimated)',
    bytesPerIteration: Number(
      Math.max(
        0,
        arraySparseCombined.stableBytesPerIteration -
          arraySparseSet.stableBytesPerIteration,
      ).toFixed(2),
    ),
    sourceMetric: 'stableBytesPerIteration',
    method: 'combined - set-only',
  });
}

if (jsonMode) {
  process.stdout.write(
    `${JSON.stringify({ results, approximations }, null, 2)}\n`,
  );
} else {
  console.log('\nSnapshot GC Report (heapUsed delta after forced GC)');
  console.table(results);
  if (approximations.length > 0) {
    console.log('\nApproximation (directional only)');
    console.table(approximations);
  }
}
