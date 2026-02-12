import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Bench } from 'tinybench';

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, 'apps', 'docs', 'src', 'content', 'docs');
const ioDistRoot = path.join(repoRoot, 'packages', 'io', 'dist');
const BENCH_TIME_MS = 2000;
const BENCH_WARMUP_MS = 250;

async function ensureDistExists() {
  try {
    await fs.stat(ioDistRoot);
  } catch (error) {
    throw new Error(
      `io-store dist not found at ${ioDistRoot}. Run "nx run io-store:build" first.`
    );
  }
}

function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return 'n/a';
  return value.toFixed(decimals);
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
  let root = { value: 0 };
  let current = root;
  for (let i = 1; i < depth; i += 1) {
    current.child = { value: i };
    current = current.child;
  }
  return root;
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
    pathToFileURL(path.join(ioDistRoot, 'lib', 'unit.js')).href
  );
  const { createDraft, finishDraft } = await import(
    pathToFileURL(path.join(ioDistRoot, 'lib', 'cow.js')).href
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
    const onValue = () => {};
    for (let i = 0; i < 10_000; i += 1) {
      const unsub = unit.subscribe(onValue);
      unsub();
    }
  });

  bench.add('subscribe/unsubscribe: update (10k)', () => {
    const unit = createUnit(0);
    const onUpdate = () => {};
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
      task.result?.mean ??
      (Number.isFinite(hz) && hz > 0 ? 1000 / hz : 0);
    const rme = task.result?.rme ?? 0;
    return {
      name: task.name,
      hz: hasError ? Number.NaN : hz,
      meanMs: hasError ? Number.NaN : meanMs,
      rme: hasError ? Number.NaN : rme,
    };
  });
}

function buildMarkdown({ locale, results, runtime }) {
  const labels =
    locale === 'zh-cn'
      ? {
          title: 'Benchmark',
          description: 'IO 核心链路性能基准（自动生成）。',
          heading: 'Benchmark 结果',
          envHeading: '运行环境',
          note: '本页由 `nx run apps-docs:generate-bench` 自动生成。',
          disclaimer: '结果会随硬件、负载与 Node 版本变化。',
          scenario: '场景',
          ops: 'ops/sec',
          mean: 'mean (ms/op)',
          rme: '误差 (±rme %)',
        }
      : {
          title: 'Benchmark',
          description: 'Performance benchmarks for core IO paths (generated).',
          heading: 'Benchmark Results',
          envHeading: 'Environment',
          note: 'This page is generated by `nx run apps-docs:generate-bench`.',
          disclaimer: 'Numbers vary by hardware, load, and Node version.',
          scenario: 'Scenario',
          ops: 'ops/sec',
          mean: 'mean (ms/op)',
          rme: 'Error (±rme %)',
        };

  const frontmatter = `---\ntitle: ${JSON.stringify(
    labels.title
  )}\ndescription: ${JSON.stringify(labels.description)}\nsidebar:\n  order: 6\n---\n`;

  const envLines = [
    `- Date: ${runtime.date}`,
    `- Node: ${runtime.node}`,
    `- Platform: ${runtime.platform}`,
    `- CPU: ${runtime.cpu}`,
    `- Benchmark time: ${runtime.timeMs}ms per task`,
    `- Warmup time: ${runtime.warmupMs}ms per task`,
  ].join('\n');

  const rows = results
    .map(
      (row) =>
        `| ${row.name} | ${formatNumber(row.hz)} | ${formatNumber(row.meanMs)} | ${formatNumber(row.rme)} |`
    )
    .join('\n');

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
    `## ${labels.heading}`,
    '',
    `| ${labels.scenario} | ${labels.ops} | ${labels.mean} | ${labels.rme} |`,
    '| --- | --- | --- | --- |',
    rows,
    '',
  ].join('\n');
}

async function writeDocs(results) {
  const runtime = {
    date: new Date().toISOString(),
    node: process.version,
    platform: `${os.platform()} ${os.release()} (${os.arch()})`,
    cpu: os.cpus()?.[0]?.model ?? 'unknown',
    timeMs: BENCH_TIME_MS,
    warmupMs: BENCH_WARMUP_MS,
  };

  const locales = ['en', 'zh-cn'];
  for (const locale of locales) {
    const markdown = buildMarkdown({ locale, results, runtime });
    const filePath = path.join(docsRoot, locale, 'guides', 'benchmark.mdx');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, markdown);
  }
}

const results = await runBenchmarks();
await writeDocs(results);
