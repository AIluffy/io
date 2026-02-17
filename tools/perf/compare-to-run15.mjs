#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASELINE_INDEX = 15;
const DEFAULT_THRESHOLD = 1.1;

function parseArgs(argv) {
  const options = {
    baselineIndex: DEFAULT_BASELINE_INDEX,
    threshold: DEFAULT_THRESHOLD,
    baselinePath: undefined,
    json: false,
    inputs: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--baseline-index') {
      options.baselineIndex = Number(argv[++i]);
      continue;
    }
    if (arg === '--threshold') {
      options.threshold = Number(argv[++i]);
      continue;
    }
    if (arg === '--baseline') {
      options.baselinePath = argv[++i];
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    options.inputs.push(arg);
  }

  return options;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function median(values) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function extractFromBenchHistoryRecord(record) {
  if (!record || typeof record !== 'object') return undefined;
  if (!Array.isArray(record.results)) return undefined;
  const map = new Map();
  for (const item of record.results) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.name !== 'string') continue;
    if (!isFiniteNumber(item.meanMs)) continue;
    map.set(item.name, item.meanMs);
  }
  return map.size > 0 ? map : undefined;
}

function extractFromVitestBenchResult(payload) {
  if (!payload || typeof payload !== 'object') return undefined;
  if (!Array.isArray(payload.files)) return undefined;
  const map = new Map();
  for (const file of payload.files) {
    if (!file || typeof file !== 'object') continue;
    if (!Array.isArray(file.groups)) continue;
    for (const group of file.groups) {
      if (!group || typeof group !== 'object') continue;
      if (!Array.isArray(group.benchmarks)) continue;
      for (const bench of group.benchmarks) {
        if (!bench || typeof bench !== 'object') continue;
        if (typeof bench.name !== 'string') continue;
        const mean = isFiniteNumber(bench.mean)
          ? bench.mean
          : isFiniteNumber(bench.period)
            ? bench.period
            : undefined;
        if (mean === undefined) continue;
        map.set(bench.name, mean);
      }
    }
  }
  return map.size > 0 ? map : undefined;
}

function extractScenarioMap(payload) {
  const fromVitest = extractFromVitestBenchResult(payload);
  if (fromVitest) return fromVitest;

  const fromRecord = extractFromBenchHistoryRecord(payload);
  if (fromRecord) return fromRecord;

  if (Array.isArray(payload) && payload.length > 0) {
    const last = payload[payload.length - 1];
    const fromArrayRecord = extractFromBenchHistoryRecord(last);
    if (fromArrayRecord) return fromArrayRecord;
  }

  return undefined;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function formatPct(value) {
  const pct = value * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

const options = parseArgs(process.argv.slice(2));

if (!Number.isInteger(options.baselineIndex) || options.baselineIndex < 0) {
  throw new Error('--baseline-index must be a non-negative integer');
}
if (!isFiniteNumber(options.threshold) || options.threshold <= 0) {
  throw new Error('--threshold must be a positive number');
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const baselinePath =
  options.baselinePath ??
  path.join(repoRoot, 'tools', 'docs', 'bench-history.json');

const history = await readJson(baselinePath);
if (!Array.isArray(history)) {
  throw new Error(`baseline file must be a JSON array: ${baselinePath}`);
}
if (options.baselineIndex >= history.length) {
  throw new Error(
    `baseline index ${options.baselineIndex} out of range (history length ${history.length})`,
  );
}

const baselineRecord = history[options.baselineIndex];
const baselineMap = extractFromBenchHistoryRecord(baselineRecord);
if (!baselineMap) {
  throw new Error(
    `unable to extract baseline scenarios at index ${options.baselineIndex}`,
  );
}

let inputPaths = options.inputs;
if (inputPaths.length === 0) {
  inputPaths = [path.join(repoRoot, 'packages', 'io', 'test-output', 'vitest', 'bench-results.json')];
}

const currentMaps = [];
for (const inputPath of inputPaths) {
  const payload = await readJson(inputPath);
  const scenarioMap = extractScenarioMap(payload);
  if (!scenarioMap) {
    throw new Error(`unsupported benchmark payload: ${inputPath}`);
  }
  currentMaps.push({ inputPath, scenarioMap });
}

const rows = [];
for (const [name, baselineMean] of baselineMap.entries()) {
  const collected = [];
  for (const { scenarioMap } of currentMaps) {
    const value = scenarioMap.get(name);
    if (isFiniteNumber(value)) collected.push(value);
  }
  const currentMedian = median(collected);
  const limit = baselineMean * options.threshold;
  const ratio = currentMedian === undefined ? undefined : currentMedian / baselineMean;
  const passed = currentMedian !== undefined && currentMedian <= limit;
  rows.push({
    name,
    baselineMean,
    currentMedian,
    runs: collected.length,
    limit,
    ratio,
    passed,
  });
}

const passedCount = rows.filter((row) => row.passed).length;
const totalCount = rows.length;
const failedRows = rows.filter((row) => !row.passed);

const summary = {
  baselinePath,
  baselineIndex: options.baselineIndex,
  threshold: options.threshold,
  comparedRuns: currentMaps.length,
  passed: passedCount,
  total: totalCount,
  allPassed: passedCount === totalCount,
};

if (options.json) {
  console.log(
    JSON.stringify(
      {
        summary,
        rows: rows.map((row) => ({
          ...row,
          baselineMean: round(row.baselineMean, 6),
          currentMedian:
            row.currentMedian === undefined ? undefined : round(row.currentMedian, 6),
          limit: round(row.limit, 6),
          deltaPct:
            row.ratio === undefined ? undefined : round((row.ratio - 1) * 100, 4),
        })),
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `compare-to-run15 baseline[${options.baselineIndex}] threshold=${options.threshold.toFixed(2)}x runs=${currentMaps.length}`,
  );
  console.log(`result: ${passedCount}/${totalCount} passed`);
  console.log('');
  for (const row of rows) {
    if (row.currentMedian === undefined) {
      console.log(`${row.passed ? 'PASS' : 'FAIL'}\t${row.name}\tmissing`);
      continue;
    }
    const delta = row.ratio - 1;
    console.log(
      `${row.passed ? 'PASS' : 'FAIL'}\t${row.name}\tbaseline=${row.baselineMean.toFixed(4)} current=${row.currentMedian.toFixed(4)} delta=${formatPct(delta)} limit=${row.limit.toFixed(4)} runs=${row.runs}`,
    );
  }

  if (failedRows.length > 0) {
    console.log('');
    console.log('failed scenarios:');
    for (const row of failedRows) {
      const reason =
        row.currentMedian === undefined
          ? 'missing current value'
          : `current ${row.currentMedian.toFixed(4)} > limit ${row.limit.toFixed(4)}`;
      console.log(`- ${row.name}: ${reason}`);
    }
  }
}

if (failedRows.length > 0) process.exitCode = 1;
