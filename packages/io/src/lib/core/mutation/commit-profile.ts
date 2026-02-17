type Metric = {
  calls: number;
  totalMs: number;
};

const getNow = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const isEnabled = (): boolean => {
  const maybeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return maybeProcess?.env?.IO_COMMIT_PROFILE === '1';
};

const ENABLED = isEnabled();
const METRICS = new Map<string, Metric>();
let hookInstalled = false;

function ensureMetric(name: string): Metric {
  let metric = METRICS.get(name);
  if (!metric) {
    metric = { calls: 0, totalMs: 0 };
    METRICS.set(name, metric);
  }
  return metric;
}

function installExitHook(): void {
  if (!ENABLED || hookInstalled) return;
  hookInstalled = true;
  const maybeProcess = (globalThis as { process?: { on?: (event: string, handler: () => void) => void } }).process;
  if (!maybeProcess || typeof maybeProcess.on !== 'function') return;
  maybeProcess.on('exit', () => {
    if (METRICS.size === 0) return;
    const rows = Array.from(METRICS.entries())
      .map(([name, metric]) => ({
        name,
        calls: metric.calls,
        totalMs: metric.totalMs,
        avgMs: metric.totalMs / metric.calls,
      }))
      .sort((a, b) => b.totalMs - a.totalMs);

    // eslint-disable-next-line no-console
    console.log('[io-commit-profile] summary (ms)');
    for (const row of rows) {
      // eslint-disable-next-line no-console
      console.log(
        `[io-commit-profile] ${row.name}: total=${row.totalMs.toFixed(3)} calls=${row.calls} avg=${row.avgMs.toFixed(6)}`,
      );
    }

    const depthTotals = Array.from(METRICS.entries())
      .map(([name, metric]) => {
        const matched = /^commit\.diff\.scope\.depth\.(\d+)\.total$/.exec(name);
        if (!matched) return undefined;
        return { depth: Number(matched[1]), metric };
      })
      .filter((row): row is { depth: number; metric: Metric } => row !== undefined)
      .sort((a, b) => a.depth - b.depth);

    if (depthTotals.length > 1) {
      const selfRows = depthTotals.map((row, index) => {
        const child = depthTotals[index + 1];
        const selfTotalMs = child
          ? Math.max(0, row.metric.totalMs - child.metric.totalMs)
          : row.metric.totalMs;
        return {
          depth: row.depth,
          selfTotalMs,
          selfAvgMs: selfTotalMs / row.metric.calls,
        };
      });

      const topSelfRows = [...selfRows]
        .sort((a, b) => b.selfTotalMs - a.selfTotalMs)
        .slice(0, 12);

      // eslint-disable-next-line no-console
      console.log('[io-commit-profile] top scope depth self-time (ms)');
      for (const row of topSelfRows) {
        // eslint-disable-next-line no-console
        console.log(
          `[io-commit-profile] depth=${row.depth} selfTotal=${row.selfTotalMs.toFixed(3)} selfAvg=${row.selfAvgMs.toFixed(6)}`,
        );
      }
    }
  });
}

export function profileStart(): number {
  if (!ENABLED) return 0;
  installExitHook();
  return getNow();
}

export function profileEnd(name: string, start: number): void {
  if (!ENABLED || start === 0) return;
  const elapsed = getNow() - start;
  const metric = ensureMetric(name);
  metric.calls += 1;
  metric.totalMs += elapsed;
}
