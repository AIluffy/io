import type {
  IoDevtoolsEvent,
  IoDevtoolsPerfSample,
  IoDevtoolsPerfSummary,
  IoDevtoolsState,
} from '../types.js';

type PerfTrackerOptions = {
  enabled: boolean;
  windowSize: number;
  sampleRate: number;
  emit: (event: IoDevtoolsEvent) => void;
  getState: () => IoDevtoolsState;
};

export type PerfTracker = {
  enabled: boolean;
  getState: () => IoDevtoolsState['perf'];
  record: (sample: IoDevtoolsPerfSample) => void;
};

function defaultPerfSummary(windowSize: number): IoDevtoolsPerfSummary {
  return {
    windowSize,
    avgTotalMs: 0,
    maxTotalMs: 0,
    avgSnapshotMs: 0,
    maxSnapshotMs: 0,
    avgDiffMs: 0,
    maxDiffMs: 0,
  };
}

function computePerfSummary(
  recent: ReadonlyArray<IoDevtoolsPerfSample>,
  windowSize: number,
): IoDevtoolsPerfSummary {
  if (recent.length === 0) return defaultPerfSummary(windowSize);
  let totalSum = 0;
  let totalMax = 0;
  let snapSum = 0;
  let snapMax = 0;
  let diffSum = 0;
  let diffMax = 0;
  let snapCount = 0;
  let diffCount = 0;

  for (const s of recent) {
    totalSum += s.totalMs;
    totalMax = Math.max(totalMax, s.totalMs);
    if (typeof s.snapshotMs === 'number') {
      snapSum += s.snapshotMs;
      snapMax = Math.max(snapMax, s.snapshotMs);
      snapCount += 1;
    }
    if (typeof s.diffMs === 'number') {
      diffSum += s.diffMs;
      diffMax = Math.max(diffMax, s.diffMs);
      diffCount += 1;
    }
  }

  return {
    windowSize,
    avgTotalMs: totalSum / recent.length,
    maxTotalMs: totalMax,
    avgSnapshotMs: snapCount ? snapSum / snapCount : undefined,
    maxSnapshotMs: snapCount ? snapMax : undefined,
    avgDiffMs: diffCount ? diffSum / diffCount : undefined,
    maxDiffMs: diffCount ? diffMax : undefined,
  };
}

export function createPerfTracker(options: PerfTrackerOptions): PerfTracker {
  const perfRecent: IoDevtoolsPerfSample[] = [];

  const getPerfState = (): IoDevtoolsState['perf'] => {
    if (!options.enabled) return undefined;
    return {
      recent: perfRecent,
      summary: computePerfSummary(perfRecent, options.windowSize),
    };
  };

  const record = (sample: IoDevtoolsPerfSample) => {
    if (!options.enabled) return;
    if (options.sampleRate < 1 && Math.random() > options.sampleRate) return;
    perfRecent.push(sample);
    while (perfRecent.length > options.windowSize) perfRecent.shift();
    const summary = computePerfSummary(perfRecent, options.windowSize);
    options.emit({ type: 'perf', sample, summary, state: options.getState() });
  };

  return {
    enabled: options.enabled,
    getState: getPerfState,
    record,
  };
}
