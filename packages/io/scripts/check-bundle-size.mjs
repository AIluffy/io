import fs from 'node:fs/promises';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const CURRENT_ENV = {
  platform: process.platform,
  arch: process.arch,
  nodeMajor: Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10),
};
const DEFAULT_BASELINE_PATH = new URL('./bundle-size-baseline.json', import.meta.url);
const BASELINE_PATH =
  process.env.IO_SIZE_BASELINE_PATH ?? DEFAULT_BASELINE_PATH;
const DEFAULT_BUDGETS = {
  selective: { raw: 45_000, gzip: 13_000, brotli: 12_000 },
  full: { raw: 58_000, gzip: 17_000, brotli: 15_000 },
  entries: {
    derived: { raw: 10_000, gzip: 3_000, brotli: 2_700 },
    patches: { raw: 15_000, gzip: 4_500, brotli: 4_000 },
    debug: { raw: 9_000, gzip: 3_000, brotli: 2_700 },
    extensions: { raw: 9_000, gzip: 3_000, brotli: 2_700 },
  },
};
const DEFAULT_MIN_SAVINGS_RATIO = 0.15;
const DEFAULT_MAX_REGRESS_PCT = 15;

function bytesToKiB(bytes) {
  return Number((bytes / 1024).toFixed(2));
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toPositiveFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function ensureFinitePositive(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`invalid number for ${name}: ${value}`);
  }
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

function getMetric(entry, key) {
  if (!entry || typeof entry !== 'object') return undefined;
  const metrics =
    'metrics' in entry && entry.metrics && typeof entry.metrics === 'object'
      ? entry.metrics
      : undefined;
  return toPositiveFiniteNumber(metrics?.[key]);
}

function withRegressLimit(value, maxRegressPct) {
  return Math.ceil(value * (1 + maxRegressPct / 100));
}

function resolveBudgets(entry, maxRegressPct) {
  const selectiveRaw = getMetric(entry, 'selectiveRawBytes');
  const selectiveGzip = getMetric(entry, 'selectiveGzipBytes');
  const selectiveBrotli = getMetric(entry, 'selectiveBrotliBytes');
  const fullRaw = getMetric(entry, 'fullRawBytes');
  const fullGzip = getMetric(entry, 'fullGzipBytes');
  const fullBrotli = getMetric(entry, 'fullBrotliBytes');
  const entries = {};
  for (const name of Object.keys(DEFAULT_BUDGETS.entries)) {
    const raw = getMetric(entry, `${name}EntryRawBytes`);
    const gzip = getMetric(entry, `${name}EntryGzipBytes`);
    const brotli = getMetric(entry, `${name}EntryBrotliBytes`);
    entries[name] = {
      raw: raw
        ? withRegressLimit(raw, maxRegressPct)
        : DEFAULT_BUDGETS.entries[name].raw,
      gzip: gzip
        ? withRegressLimit(gzip, maxRegressPct)
        : DEFAULT_BUDGETS.entries[name].gzip,
      brotli: brotli
        ? withRegressLimit(brotli, maxRegressPct)
        : DEFAULT_BUDGETS.entries[name].brotli,
    };
  }

  return {
    selective: {
      raw: selectiveRaw
        ? withRegressLimit(selectiveRaw, maxRegressPct)
        : DEFAULT_BUDGETS.selective.raw,
      gzip: selectiveGzip
        ? withRegressLimit(selectiveGzip, maxRegressPct)
        : DEFAULT_BUDGETS.selective.gzip,
      brotli: selectiveBrotli
        ? withRegressLimit(selectiveBrotli, maxRegressPct)
        : DEFAULT_BUDGETS.selective.brotli,
    },
    full: {
      raw: fullRaw
        ? withRegressLimit(fullRaw, maxRegressPct)
        : DEFAULT_BUDGETS.full.raw,
      gzip: fullGzip
        ? withRegressLimit(fullGzip, maxRegressPct)
        : DEFAULT_BUDGETS.full.gzip,
      brotli: fullBrotli
        ? withRegressLimit(fullBrotli, maxRegressPct)
        : DEFAULT_BUDGETS.full.brotli,
    },
    entries,
  };
}

function assertWithinBudget(label, stats, limit) {
  const failures = [];
  if (stats.raw > limit.raw) failures.push(`raw ${stats.raw} > ${limit.raw}`);
  if (stats.gzip > limit.gzip) failures.push(`gzip ${stats.gzip} > ${limit.gzip}`);
  if (stats.brotli > limit.brotli) {
    failures.push(`brotli ${stats.brotli} > ${limit.brotli}`);
  }
  if (failures.length > 0) {
    throw new Error(`${label} bundle budget exceeded: ${failures.join(', ')}`);
  }
}

function assertTreeShakingSavings(selective, full, minSavingsRatio) {
  const selectiveToFull = selective.raw / full.raw;
  const savingsRatio = 1 - selectiveToFull;
  if (savingsRatio < minSavingsRatio) {
    throw new Error(
      `tree-shaking check failed: selective bundle saves ${(savingsRatio * 100).toFixed(2)}%, expected at least ${(minSavingsRatio * 100).toFixed(2)}%`,
    );
  }
  return { savingsRatio, selectiveToFull };
}

async function buildStats(label, source) {
  const result = await build({
    stdin: {
      contents: source,
      resolveDir: new URL('..', import.meta.url).pathname,
      sourcefile: `${label}.ts`,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    treeShaking: true,
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
  });

  const output = result.outputFiles.at(0);
  if (!output) throw new Error(`build failed for ${label}: no output`);
  return {
    raw: output.contents.length,
    gzip: gzipSync(output.contents, { level: 9 }).length,
    brotli: brotliCompressSync(output.contents).length,
  };
}

const warnings = [];
const baselineConfig = await readBaselineConfig(BASELINE_PATH);
if (!baselineConfig) {
  warnings.push('bundle baseline file not found, using default absolute budgets');
}
const baselineEntry = getBaselineEntry(baselineConfig, CURRENT_ENV);
if (baselineConfig && !baselineEntry) {
  warnings.push('no baseline for current env, using default absolute budgets');
}

const maxRegressPct =
  toFiniteNumber(process.env.IO_SIZE_MAX_REGRESS_PCT) ??
  toFiniteNumber(baselineConfig?.defaults?.maxRegressPct) ??
  DEFAULT_MAX_REGRESS_PCT;
const minSelectiveSavingsRatio =
  toFiniteNumber(process.env.IO_TREE_SHAKING_MIN_SAVINGS_RATIO) ??
  toFiniteNumber(baselineConfig?.defaults?.minSelectiveSavingsRatio) ??
  DEFAULT_MIN_SAVINGS_RATIO;
const budgets = resolveBudgets(baselineEntry, maxRegressPct);

for (const [name, limit] of Object.entries({
  selective: budgets.selective,
  full: budgets.full,
})) {
  ensureFinitePositive(`${name}.raw`, limit.raw);
  ensureFinitePositive(`${name}.gzip`, limit.gzip);
  ensureFinitePositive(`${name}.brotli`, limit.brotli);
}
for (const [name, limit] of Object.entries(budgets.entries)) {
  ensureFinitePositive(`entries.${name}.raw`, limit.raw);
  ensureFinitePositive(`entries.${name}.gzip`, limit.gzip);
  ensureFinitePositive(`entries.${name}.brotli`, limit.brotli);
}
ensureFinitePositive('IO_TREE_SHAKING_MIN_SAVINGS_RATIO', minSelectiveSavingsRatio);

const selective = await buildStats(
  'selective',
  "import { io } from '@iostore/store';\nconsole.log(typeof io);",
);
const full = await buildStats(
  'full',
  [
    "import * as store from '@iostore/store';",
    "import * as derived from '@iostore/store/derived';",
    "import * as patches from '@iostore/store/patches';",
    "import * as debug from '@iostore/store/debug';",
    "import * as extensions from '@iostore/store/extensions';",
    'console.log(Object.keys(store).length + Object.keys(derived).length + Object.keys(patches).length + Object.keys(debug).length + Object.keys(extensions).length);',
  ].join('\n'),
);
const entrySources = {
  derived: "import { derived } from '@iostore/store/derived';\nconsole.log(typeof derived);",
  patches:
    "import { applyUpdate } from '@iostore/store/patches';\nconsole.log(typeof applyUpdate);",
  debug:
    "import { onError } from '@iostore/store/debug';\nconsole.log(typeof onError);",
  extensions:
    "import { relocate } from '@iostore/store/extensions';\nconsole.log(typeof relocate);",
};
const entryStats = {};
for (const [name, source] of Object.entries(entrySources)) {
  entryStats[name] = await buildStats(`entry-${name}`, source);
}

assertWithinBudget('selective', selective, budgets.selective);
assertWithinBudget('full', full, budgets.full);
for (const [name, stats] of Object.entries(entryStats)) {
  assertWithinBudget(`${name} entry`, stats, budgets.entries[name]);
}
const treeShaking = assertTreeShakingSavings(
  selective,
  full,
  minSelectiveSavingsRatio,
);

for (const warning of warnings) {
  console.warn(`[bundle-size] ${warning}`);
}

console.log(
  JSON.stringify(
    {
      selective: {
        rawBytes: selective.raw,
        rawKiB: bytesToKiB(selective.raw),
        gzipBytes: selective.gzip,
        gzipKiB: bytesToKiB(selective.gzip),
        brotliBytes: selective.brotli,
        brotliKiB: bytesToKiB(selective.brotli),
      },
      full: {
        rawBytes: full.raw,
        rawKiB: bytesToKiB(full.raw),
        gzipBytes: full.gzip,
        gzipKiB: bytesToKiB(full.gzip),
        brotliBytes: full.brotli,
        brotliKiB: bytesToKiB(full.brotli),
      },
      entries: Object.fromEntries(
        Object.entries(entryStats).map(([name, stats]) => [
          name,
          {
            rawBytes: stats.raw,
            rawKiB: bytesToKiB(stats.raw),
            gzipBytes: stats.gzip,
            gzipKiB: bytesToKiB(stats.gzip),
            brotliBytes: stats.brotli,
            brotliKiB: bytesToKiB(stats.brotli),
          },
        ]),
      ),
      budgets,
      baseline: {
        path:
          typeof BASELINE_PATH === 'string'
            ? BASELINE_PATH
            : BASELINE_PATH.pathname,
        environment: CURRENT_ENV,
        maxRegressPct,
        warnings,
      },
      treeShaking: {
        minSavingsRatio: minSelectiveSavingsRatio,
        actualSavingsRatio: Number(treeShaking.savingsRatio.toFixed(4)),
        selectiveToFullRatio: Number(treeShaking.selectiveToFull.toFixed(4)),
        passed: true,
      },
    },
    null,
    2,
  ),
);
