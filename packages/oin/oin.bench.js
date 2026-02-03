import { performance } from 'node:perf_hooks';

globalThis.__OIN_DEVTOOLS__ = false;

function buildDeepObject(depth, width) {
  let current = {};
  const root = current;
  for (let d = 0; d < depth; d += 1) {
    const next = {};
    for (let i = 0; i < width; i += 1) {
      next[`k${d}_${i}`] = i;
    }
    current.child = next;
    current = next;
  }
  return root;
}

async function loadOin() {
  try {
    const mod = await import('./dist/index.js');
    return mod.oin;
  } catch {
    const { createJiti } = await import('jiti');
    const jiti = createJiti(import.meta.url);
    const mod = await jiti.import('./src/lib/oin.ts');
    if (typeof mod.oin !== 'function') throw new Error('Invalid oin export');
    return mod.oin;
  }
}

function toMB(bytes) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

const ITERATIONS = 10_000;
const MAX_MS = 60;
const MAX_HEAP_GROWTH_RATIO = 0.15;
const SAMPLE_EVERY = 250;

const oin = await loadOin();
const fixture = buildDeepObject(5, 20);

for (let i = 0; i < 500; i += 1) oin(fixture);
const node = oin(fixture);
node.snapshot?.();
if (globalThis.gc) globalThis.gc();

const startMem = process.memoryUsage().heapUsed;
let peakMem = startMem;
const start = performance.now();

for (let i = 0; i < ITERATIONS; i += 1) {
  node.snapshot?.();
  if (i % SAMPLE_EVERY === 0) {
    const used = process.memoryUsage().heapUsed;
    if (used > peakMem) peakMem = used;
  }
}

const elapsedMs = performance.now() - start;
if (globalThis.gc) globalThis.gc();
const endMem = process.memoryUsage().heapUsed;
peakMem = Math.max(peakMem, endMem);

const heapGrowthRatio = startMem === 0 ? 0 : (peakMem - startMem) / startMem;

console.log(
  JSON.stringify(
    {
      iterations: ITERATIONS,
      elapsedMs: Math.round(elapsedMs * 100) / 100,
      heapStartMB: toMB(startMem),
      heapEndMB: toMB(endMem),
      heapPeakMB: toMB(peakMem),
      heapGrowthRatio: Math.round(heapGrowthRatio * 10_000) / 10_000,
      thresholds: {
        maxMs: MAX_MS,
        maxHeapGrowthRatio: MAX_HEAP_GROWTH_RATIO,
      },
    },
    null,
    2,
  ),
);

if (elapsedMs >= MAX_MS) process.exitCode = 1;
if (heapGrowthRatio >= MAX_HEAP_GROWTH_RATIO) process.exitCode = 1;
