import fs from 'node:fs/promises';
import createJiti from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { io } = await jiti.import('../src/index.ts');

const CURRENT_ENV = {
  platform: process.platform,
  arch: process.arch,
  nodeMajor: Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10),
};
const DEFAULT_BASELINE_PATH = new URL('./perf-budget-baseline.json', import.meta.url);
const BASELINE_PATH =
  process.env.IO_BUDGET_BASELINE_PATH ?? DEFAULT_BASELINE_PATH;
const SNAPSHOT_1K_BUDGET_MS = Number(
  process.env.IO_BUDGET_SNAPSHOT_1K_MS ?? 5,
);
const SCOPE_MEMORY_BUDGET_BYTES_PER_ITER = Number(
  process.env.IO_BUDGET_SCOPE_SPARSE_BYTES_PER_ITER ?? 128,
);
const ARRAY_MEMORY_BUDGET_BYTES_PER_ITER = Number(
  process.env.IO_BUDGET_ARRAY_SPARSE_BYTES_PER_ITER ?? 256,
);
const FALLBACK_MAX_REGRESS_PCT = 15;

function toFinite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toPositiveFinite(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

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
  return snapshotElapsed / iterations;
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

  return {
    scopeBytesPerIter: scope.bytesPerIteration,
    arrayBytesPerIter: array.bytesPerIteration,
  };
}

async function readBaselineConfig(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

function getBaselineEntry(config, env) {
  if (!config || !Array.isArray(config.environments)) return undefined;
  return config.environments.find(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      entry.platform === env.platform &&
      entry.arch === env.arch &&
      Number(entry.nodeMajor) === env.nodeMajor,
  );
}

function getBaselineMetric(entry, key) {
  if (!entry || typeof entry !== 'object') return undefined;
  const metrics =
    'metrics' in entry && entry.metrics && typeof entry.metrics === 'object'
      ? entry.metrics
      : undefined;
  const metricValue = metrics ? metrics[key] : undefined;
  return toPositiveFinite(metricValue ?? entry[key]);
}

function evaluateMetric({
  name,
  actual,
  absoluteBudget,
  baseline,
  maxRegressPct,
}) {
  if (baseline !== undefined) {
    const limit = baseline * (1 + maxRegressPct / 100);
    const regressionPct = ((actual - baseline) / baseline) * 100;
    return {
      name,
      mode: 'relative',
      actual,
      baseline,
      limit,
      regressionPct,
      absoluteBudget,
      passed: actual <= limit,
    };
  }

  return {
    name,
    mode: 'absolute',
    actual,
    baseline: null,
    limit: absoluteBudget,
    regressionPct: null,
    absoluteBudget,
    passed: actual <= absoluteBudget,
  };
}

function describeFailure(result) {
  const common = `${result.name}: actual ${result.actual.toFixed(4)} > limit ${result.limit.toFixed(4)} (${result.mode})`;
  if (result.mode !== 'relative') return common;
  return `${common}, baseline ${result.baseline.toFixed(4)}, regression ${result.regressionPct.toFixed(2)}%`;
}

function formatBaselinePath(filePath) {
  if (typeof filePath === 'string') return filePath;
  return filePath.pathname;
}

const warnings = [];
const baselineConfig = await readBaselineConfig(BASELINE_PATH);
if (!baselineConfig) {
  warnings.push(
    `baseline file not found at ${formatBaselinePath(BASELINE_PATH)}, using absolute budgets`,
  );
}
const baselineEntry = getBaselineEntry(baselineConfig, CURRENT_ENV);
if (baselineConfig && !baselineEntry) {
  warnings.push(
    `no baseline for ${CURRENT_ENV.platform}/${CURRENT_ENV.arch}/node${CURRENT_ENV.nodeMajor}, using absolute budgets`,
  );
}

const maxRegressPct = toFinite(process.env.IO_BUDGET_MAX_REGRESS_PCT)
  ?? toFinite(baselineConfig?.defaults?.maxRegressPct)
  ?? FALLBACK_MAX_REGRESS_PCT;

const snapshot1kMs = runSnapshot1kBudget();
const memory = runMemoryBudgets();

const snapshotResult = evaluateMetric({
  name: 'snapshot1kMs',
  actual: snapshot1kMs,
  absoluteBudget: SNAPSHOT_1K_BUDGET_MS,
  baseline: getBaselineMetric(baselineEntry, 'snapshot1kMs'),
  maxRegressPct,
});
const scopeResult = evaluateMetric({
  name: 'scopeSparseSnapshotBytesPerIter',
  actual: memory.scopeBytesPerIter,
  absoluteBudget: SCOPE_MEMORY_BUDGET_BYTES_PER_ITER,
  baseline: getBaselineMetric(
    baselineEntry,
    'scopeSparseSnapshotBytesPerIter',
  ),
  maxRegressPct,
});
const arrayResult = evaluateMetric({
  name: 'arraySparseSnapshotBytesPerIter',
  actual: memory.arrayBytesPerIter,
  absoluteBudget: ARRAY_MEMORY_BUDGET_BYTES_PER_ITER,
  baseline: getBaselineMetric(
    baselineEntry,
    'arraySparseSnapshotBytesPerIter',
  ),
  maxRegressPct,
});
const results = [snapshotResult, scopeResult, arrayResult];
const failures = results.filter((result) => !result.passed);

if (warnings.length > 0) {
  for (const warning of warnings) {
    console.warn(`[perf-budget] ${warning}`);
  }
}

console.log(
  JSON.stringify(
    {
      environment: CURRENT_ENV,
      baselinePath: formatBaselinePath(BASELINE_PATH),
      maxRegressPct,
      warnings,
      snapshot1kMs: round(snapshot1kMs, 4),
      snapshot1kBudgetMs: SNAPSHOT_1K_BUDGET_MS,
      scopeSparseSnapshotBytesPerIter: round(memory.scopeBytesPerIter, 2),
      scopeSparseBudgetBytesPerIter: SCOPE_MEMORY_BUDGET_BYTES_PER_ITER,
      arraySparseSnapshotBytesPerIter: round(memory.arrayBytesPerIter, 2),
      arraySparseBudgetBytesPerIter: ARRAY_MEMORY_BUDGET_BYTES_PER_ITER,
      checks: {
        snapshot1kMs: {
          mode: snapshotResult.mode,
          baseline: snapshotResult.baseline,
          regressionPct:
            snapshotResult.regressionPct === null
              ? null
              : round(snapshotResult.regressionPct, 2),
          limit: round(snapshotResult.limit, 4),
        },
        scopeSparseSnapshotBytesPerIter: {
          mode: scopeResult.mode,
          baseline: scopeResult.baseline,
          regressionPct:
            scopeResult.regressionPct === null
              ? null
              : round(scopeResult.regressionPct, 2),
          limit: round(scopeResult.limit, 2),
        },
        arraySparseSnapshotBytesPerIter: {
          mode: arrayResult.mode,
          baseline: arrayResult.baseline,
          regressionPct:
            arrayResult.regressionPct === null
              ? null
              : round(arrayResult.regressionPct, 2),
          limit: round(arrayResult.limit, 2),
        },
      },
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  throw new Error(
    `performance budget exceeded:\n${failures.map(describeFailure).join('\n')}`,
  );
}
