import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Bench } from 'tinybench';

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, 'apps', 'docs', 'src', 'content', 'docs');
const ioDistRoot = path.join(repoRoot, 'packages', 'io', 'dist');
const benchHistoryPath = path.join(repoRoot, 'tools', 'docs', 'bench-history.json');
const BENCH_TIME_MS = 2000;
const BENCH_WARMUP_MS = 250;
const BENCH_HISTORY_LIMIT = 50;
const DOC_HISTORY_WINDOW = 20;

async function ensureDistExists() {
  try {
    await fs.stat(ioDistRoot);
  } catch (error) {
    throw new Error(
      `@iostore/store dist not found at ${ioDistRoot}. Run "nx run @iostore/store:build" first.`,
    );
  }
}

function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return 'n/a';
  return value.toFixed(decimals);
}

function formatPercent(value, decimals = 2) {
  if (!Number.isFinite(value)) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

function sanitizeMermaidLabel(value) {
  return String(value).replaceAll('"', "'");
}

function toFiniteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function getScenarioGroup(name, locale) {
  const map =
    locale === 'zh-cn'
      ? {
          snapshot: 'Snapshot 路径',
          commit: 'Commit 路径',
          draft: 'Draft/COW 路径',
          batch: 'Batch/并发路径',
          default: '通用路径',
        }
      : {
          snapshot: 'Snapshot Path',
          commit: 'Commit Path',
          draft: 'Draft/COW Path',
          batch: 'Batch/Concurrency Path',
          default: 'General Path',
        };

  if (name.startsWith('snapshot:')) return map.snapshot;
  if (name.startsWith('commit')) return map.commit;
  if (name.startsWith('draft/finish')) return map.draft;
  if (name.startsWith('batch') || name.startsWith('no batch') || name.startsWith('sequential'))
    return map.batch;
  return map.default;
}

function getScenarioGroupRank(name) {
  if (name.startsWith('snapshot:')) return 1;
  if (name.startsWith('commit')) return 2;
  if (name.startsWith('draft/finish')) return 3;
  if (name.startsWith('batch') || name.startsWith('no batch') || name.startsWith('sequential'))
    return 4;
  return 5;
}

async function readBenchHistory() {
  try {
    const raw = await fs.readFile(benchHistoryPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeBenchHistory(history) {
  await fs.mkdir(path.dirname(benchHistoryPath), { recursive: true });
  await fs.writeFile(benchHistoryPath, `${JSON.stringify(history, null, 2)}\n`);
}

function buildDeepState(listSize = 200) {
  return {
    level1: {
      level2: {
        level3: { level4: { level5: { value: 0 }, extra: 0 } },
      },
    },
    list: Array.from({ length: listSize }, (_, i) => ({
      id: String(i),
      meta: { n: i },
    })),
  };
}

function buildDeepNested(depth) {
  const root = { value: 0 };
  let current = root;
  for (let i = 1; i < depth; i += 1) {
    current.child = { value: i };
    current = current.child;
  }
  return root;
}

function buildWideScope(size = 1000) {
  const scope = {};
  for (let i = 0; i < size; i += 1) {
    scope[`k${i}`] = i;
  }
  return scope;
}

function mutateDeepNested(root, next) {
  let current = root;
  while (current.child) {
    current = current.child;
  }
  current.value = next;
}

function mutateDeep(state, n) {
  state.level1.level2.level3.level4.level5.value = n;
  state.level1.level2.level3.level4.extra = n;
  const idx = n % state.list.length;
  state.list.splice(idx, 1, { id: String(n), meta: { n } });
}

async function runBenchmarks() {
  await ensureDistExists();

  const { io, batch } = await import(
    pathToFileURL(path.join(ioDistRoot, 'index.js')).href
  );
  const { createUnit } = await import(
    pathToFileURL(path.join(ioDistRoot, 'lib', 'units', 'unit.js')).href
  );
  const { createDraft, finishDraft } = await import(
    pathToFileURL(path.join(ioDistRoot, 'lib', 'utils', 'cow.js')).href
  );

  const bench = new Bench({
    time: BENCH_TIME_MS,
    warmupTime: BENCH_WARMUP_MS,
  });

  bench.add('createUnit: primitive (1k)', () => {
    for (let i = 0; i < 1_000; i += 1) {
      createUnit(i);
    }
  });

  bench.add('createUnit: object (1k)', () => {
    for (let i = 0; i < 1_000; i += 1) {
      createUnit({ a: i, b: { c: i } });
    }
  });

  bench.add('subscribe/unsubscribe: value (10k)', () => {
    const unit = createUnit(0);
    const onValue = () => undefined;
    for (let i = 0; i < 10_000; i += 1) {
      const unsub = unit.subscribe(onValue);
      unsub();
    }
  });

  bench.add('subscribe/unsubscribe: update (10k)', () => {
    const unit = createUnit(0);
    const onUpdate = () => undefined;
    for (let i = 0; i < 10_000; i += 1) {
      const unsub = unit.subscribeUpdate(onUpdate);
      unsub();
    }
  });

  bench.add('snapshot: scope (10k)', () => {
    const store = io(buildDeepState(100));
    for (let i = 0; i < 10_000; i += 1) {
      store.snapshot();
    }
  });

  bench.add('snapshot: array (10k)', () => {
    const list = io(Array.from({ length: 500 }, (_, i) => i));
    for (let i = 0; i < 10_000; i += 1) {
      list.snapshot();
    }
  });

  bench.add('snapshot: array (20k boundary)', () => {
    const list = io(Array.from({ length: 20_000 }, (_, i) => i));
    for (let i = 0; i < 2_000; i += 1) {
      list.snapshot();
    }
  });

  bench.add('snapshot: depth (80 boundary)', () => {
    const store = io(buildDeepNested(80));
    for (let i = 0; i < 5_000; i += 1) {
      store.snapshot();
    }
  });

  bench.add('snapshot: scope sparse dirty key (1k)', () => {
    const store = io(buildWideScope(1_000));
    for (let i = 0; i < 2_000; i += 1) {
      const key = `k${i % 1_000}`;
      store[key].set(i);
      store.snapshot();
    }
  });

  bench.add('snapshot: scope dense dirty keys (1k)', () => {
    const store = io(buildWideScope(1_000));
    for (let round = 0; round < 20; round += 1) {
      for (let i = 0; i < 1_000; i += 1) {
        store[`k${i}`].set(i + round);
      }
      store.snapshot();
    }
  });

  bench.add('draft/finish: deep object (200)', () => {
    let before = buildDeepState(200);
    for (let i = 0; i < 200; i += 1) {
      const draft = createDraft(before);
      mutateDeep(draft, i);
      before = finishDraft(draft);
    }
  });

  bench.add('commit deep update (200)', () => {
    const store = io(buildDeepState(200));
    for (let i = 0; i < 200; i += 1) {
      store.commit((draft) => {
        mutateDeep(draft, i);
      });
    }
  });

  bench.add('commit deep update (80 boundary)', () => {
    const store = io(buildDeepNested(80));
    for (let i = 0; i < 1_000; i += 1) {
      store.commit((draft) => {
        mutateDeepNested(draft, i);
      });
    }
  });

  bench.add('batch: 40k updates', () => {
    const count = io(0);
    for (let i = 0; i < 200; i += 1) {
      batch(() => {
        for (let j = 0; j < 200; j += 1) {
          count.set(j);
        }
      });
    }
  });

  bench.add('no batch: 40k updates', () => {
    const count = io(0);
    for (let i = 0; i < 200; i += 1) {
      for (let j = 0; j < 200; j += 1) {
        count.set(j);
      }
    }
  });

  bench.add('batch update 200 units', () => {
    const list = io(Array.from({ length: 200 }, () => 0));
    for (let r = 0; r < 200; r += 1) {
      batch(() => {
        for (let i = 0; i < 200; i += 1) {
          list[i].set(i + r);
        }
      });
    }
  });

  bench.add('sequential update 200 units', () => {
    const list = io(Array.from({ length: 200 }, () => 0));
    for (let r = 0; r < 200; r += 1) {
      for (let i = 0; i < 200; i += 1) {
        list[i].set(i + r);
      }
    }
  });

  await bench.run();

  return bench.tasks.map((task) => {
    const hasError = task.result?.error !== undefined;
    const hz = task.result?.hz ?? 0;
    const meanMs =
      task.result?.mean ?? (Number.isFinite(hz) && hz > 0 ? 1000 / hz : 0);
    const rme = task.result?.rme ?? 0;
    return {
      name: task.name,
      hz: hasError ? Number.NaN : hz,
      meanMs: hasError ? Number.NaN : meanMs,
      rme: hasError ? Number.NaN : rme,
    };
  });
}

function buildMarkdown({ locale, history }) {
  const labels =
    locale === 'zh-cn'
      ? {
          title: 'Benchmark',
          description: 'IO 核心链路性能基准（自动生成）。',
          latestHeading: '最新结果',
          historyHeading: '历史趋势（每次 bench 变化）',
          topChangesHeading: '较上次变化最大场景',
          envHeading: '本次运行环境',
          timelineHeading: '运行时间线',
          trendUnit: 'ms/op（越低越好）',
          note: '本页由 `nx run apps-docs:generate-bench` 自动生成。',
          disclaimer: '结果会随硬件、负载与 Node 版本变化。',
          run: '运行',
          date: '时间',
          node: 'Node',
          platform: '平台',
          scenario: '场景',
          latestMean: '最新 mean (ms/op)',
          latestOps: '最新 ops/sec',
          delta: '较上次变化 (mean)',
          absDelta: '变化幅度',
          noPrevious: '首次记录',
          latestMeta: '最新：',
          previousMeta: '上次：',
          trendByGroup: '分组趋势图',
        }
      : {
          title: 'Benchmark',
          description: 'Performance benchmarks for core IO paths (generated).',
          latestHeading: 'Latest Results',
          historyHeading: 'Trend Charts (Change Per Bench Run)',
          topChangesHeading: 'Largest Changes vs Previous Run',
          envHeading: 'Latest Run Environment',
          timelineHeading: 'Run Timeline',
          trendUnit: 'ms/op (lower is better)',
          note: 'This page is generated by `nx run apps-docs:generate-bench`.',
          disclaimer: 'Numbers vary by hardware, load, and Node version.',
          run: 'Run',
          date: 'Date',
          node: 'Node',
          platform: 'Platform',
          scenario: 'Scenario',
          latestMean: 'Latest mean (ms/op)',
          latestOps: 'Latest ops/sec',
          delta: 'Delta vs previous (mean)',
          absDelta: 'Absolute delta',
          noPrevious: 'First record',
          latestMeta: 'Latest:',
          previousMeta: 'Previous:',
          trendByGroup: 'Trend Charts by Group',
        };

  const frontmatter = `---\ntitle: ${JSON.stringify(
    labels.title,
  )}\ndescription: ${JSON.stringify(labels.description)}\nsidebar:\n  order: 6\n---\n`;

  const historyWindow = history.slice(-DOC_HISTORY_WINDOW);
  const globalStartIndex = history.length - historyWindow.length;
  const indexedRuns = historyWindow.map((run, index) => ({
    ...run,
    runId: globalStartIndex + index + 1,
  }));

  const latestRun = indexedRuns[indexedRuns.length - 1];
  const previousRun = indexedRuns.length > 1 ? indexedRuns[indexedRuns.length - 2] : undefined;
  const latestResults = Array.isArray(latestRun?.results) ? latestRun.results : [];
  const previousByName = new Map(
    (Array.isArray(previousRun?.results) ? previousRun.results : []).map((row) => [row.name, row]),
  );

  const envLines = latestRun
    ? [
        `- Date: ${latestRun.date}`,
        `- Node: ${latestRun.node}`,
        `- Platform: ${latestRun.platform}`,
        `- CPU: ${latestRun.cpu}`,
        `- Benchmark time: ${latestRun.timeMs}ms per task`,
        `- Warmup time: ${latestRun.warmupMs}ms per task`,
      ].join('\n')
    : '- n/a';

  const timelineRows = indexedRuns
    .map(
      (run) =>
        `| ${run.runId} | ${run.date} | ${run.node} | ${run.platform} |`,
    )
    .join('\n');

  const latestRows = latestResults
    .map((row) => {
      const previous = previousByName.get(row.name);
      const delta =
        previous && Number.isFinite(previous.meanMs) && previous.meanMs !== 0
          ? ((row.meanMs - previous.meanMs) / previous.meanMs) * 100
          : Number.NaN;
      return `| ${row.name} | ${formatNumber(row.meanMs)} | ${formatNumber(row.hz)} | ${Number.isFinite(delta) ? formatPercent(delta) : labels.noPrevious} |`;
    })
    .join('\n');

  const topChangesRows = latestResults
    .map((row) => {
      const previous = previousByName.get(row.name);
      const delta =
        previous && Number.isFinite(previous.meanMs) && previous.meanMs !== 0
          ? ((row.meanMs - previous.meanMs) / previous.meanMs) * 100
          : Number.NaN;
      return {
        name: row.name,
        delta,
        absDelta: Number.isFinite(delta) ? Math.abs(delta) : Number.NaN,
      };
    })
    .filter((row) => Number.isFinite(row.delta))
    .sort((a, b) => b.absDelta - a.absDelta)
    .slice(0, 6)
    .map(
      (row) =>
        `| ${row.name} | ${formatPercent(row.delta)} | ${formatPercent(row.absDelta)} |`,
    )
    .join('\n');

  const trendSections = latestResults
    .map((row) => {
      const points = indexedRuns
        .map((run) => {
          const match = Array.isArray(run.results)
            ? run.results.find((item) => item.name === row.name)
            : undefined;
          return {
            runId: run.runId,
            meanMs: match ? toFiniteOrNull(match.meanMs) : null,
          };
        })
        .filter((point) => point.meanMs !== null);

      if (points.length === 0) return null;

      const latestPoint = points[points.length - 1];
      const previousPoint = points.length > 1 ? points[points.length - 2] : undefined;
      const delta =
        previousPoint &&
        Number.isFinite(previousPoint.meanMs) &&
        previousPoint.meanMs !== 0
          ? ((latestPoint.meanMs - previousPoint.meanMs) / previousPoint.meanMs) * 100
          : Number.NaN;

      const yValues = points.map((point) => Number(point.meanMs.toFixed(4)));
      const xValues = points.map((point) => point.runId);
      const yMaxRaw = Math.max(...yValues);
      const yMax = Number((Math.max(0.1, yMaxRaw * 1.15)).toFixed(4));

      const lines = [
        `### ${row.name}`,
        '',
        `- ${labels.latestMeta} ${formatNumber(latestPoint.meanMs)} ${labels.trendUnit}`,
        `- ${labels.previousMeta} ${previousPoint ? formatNumber(previousPoint.meanMs) : labels.noPrevious}`,
        `- ${labels.delta}: ${Number.isFinite(delta) ? formatPercent(delta) : labels.noPrevious}`,
        '',
        '```mermaid',
        'xychart-beta',
        `  title "${sanitizeMermaidLabel(row.name)}"`,
        `  x-axis "${labels.run}" [${xValues.join(', ')}]`,
        `  y-axis "${labels.trendUnit}" 0 --> ${yMax}`,
        `  line [${yValues.join(', ')}]`,
        '```',
      ];

      return {
        name: row.name,
        section: lines.join('\n'),
      };
    })
    .filter(Boolean);

  const groupedTrendSections = trendSections
    .sort((a, b) => {
      const byRank =
        getScenarioGroupRank(a.name) - getScenarioGroupRank(b.name);
      if (byRank !== 0) return byRank;
      return a.name.localeCompare(b.name);
    })
    .reduce((acc, item) => {
      const group = getScenarioGroup(item.name, locale);
      const existing = acc.get(group);
      if (existing) existing.push(item.section);
      else acc.set(group, [item.section]);
      return acc;
    }, new Map());

  const trendByGroup = Array.from(groupedTrendSections.entries())
    .map(([group, sections]) => [`### ${group}`, '', sections.join('\n\n')].join('\n'))
    .join('\n\n');

  return [
    frontmatter,
    `${labels.note}`,
    '',
    `${labels.disclaimer}`,
    '',
    `## ${labels.envHeading}`,
    '',
    envLines,
    '',
    `## ${labels.timelineHeading}`,
    '',
    `| ${labels.run} | ${labels.date} | ${labels.node} | ${labels.platform} |`,
    '| --- | --- | --- | --- |',
    timelineRows,
    '',
    `## ${labels.latestHeading}`,
    '',
    `| ${labels.scenario} | ${labels.latestMean} | ${labels.latestOps} | ${labels.delta} |`,
    '| --- | --- | --- | --- |',
    latestRows,
    '',
    `## ${labels.topChangesHeading}`,
    '',
    topChangesRows.length > 0
      ? [`| ${labels.scenario} | ${labels.delta} | ${labels.absDelta} |`, '| --- | --- | --- |', topChangesRows].join('\n')
      : labels.noPrevious,
    '',
    `## ${labels.historyHeading}`,
    '',
    `${labels.trendByGroup}`,
    '',
    trendByGroup,
    '',
  ].join('\n');
}

async function writeDocs(history) {
  const locales = ['en', 'zh-cn'];
  for (const locale of locales) {
    const markdown = buildMarkdown({ locale, history });
    const localeDir = locale === 'zh-cn' ? '' : locale;
    const filePath = path.join(docsRoot, localeDir, 'guides', 'benchmark.mdx');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, markdown);
  }
}

const results = await runBenchmarks();
const runtime = {
  date: new Date().toISOString(),
  node: process.version,
  platform: `${os.platform()} ${os.release()} (${os.arch()})`,
  cpu: os.cpus()?.[0]?.model ?? 'unknown',
  timeMs: BENCH_TIME_MS,
  warmupMs: BENCH_WARMUP_MS,
};
const history = await readBenchHistory();
const nextRun = {
  ...runtime,
  results: results.map((row) => ({
    name: row.name,
    hz: toFiniteOrNull(row.hz),
    meanMs: toFiniteOrNull(row.meanMs),
    rme: toFiniteOrNull(row.rme),
  })),
};
const nextHistory = [...history, nextRun].slice(-BENCH_HISTORY_LIMIT);
await writeBenchHistory(nextHistory);
await writeDocs(nextHistory);
