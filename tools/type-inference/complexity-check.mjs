import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function buildNestedType(width, depth) {
  if (depth <= 0) return 'number';
  const entries = [];
  for (let i = 0; i < width; i += 1) {
    entries.push(`k${i}: ${buildNestedType(width, depth - 1)}`);
  }
  return `{ ${entries.join('; ')} }`;
}

function parseCheckTimeMs(output) {
  const match = output.match(/Check time:\s+([0-9.]+)s/);
  if (!match) return null;
  return Number(match[1]) * 1000;
}

function runOnce({ width, depth }) {
  const typeStr = buildNestedType(width, depth);
  const ts = `
import type { UnwrapIo, IoPathOf } from '@iostore/store';

type State = ${typeStr};
type Unwrapped = UnwrapIo<State>;
type Paths = IoPathOf<State>;

type _ForceUnwrap = Unwrapped extends unknown ? 1 : 2;
type _ForcePaths = Paths extends unknown ? 1 : 2;

export {};
`;

  return { ts };
}

async function main() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'io-type-infer-'));
  try {
    const cases = [
      { width: 8, depth: 6 },
      { width: 16, depth: 6 },
      { width: 24, depth: 6 },
    ];

    const results = [];
    for (const c of cases) {
      const { ts } = runOnce(c);
      const file = path.join(tmp, `case-w${c.width}-d${c.depth}.ts`);
      await writeFile(file, ts);

      const proc = spawnSync(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['tsc', '--noEmit', '--pretty', 'false', '--extendedDiagnostics', file],
        { encoding: 'utf8', cwd: process.cwd() }
      );

      const out = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
      const checkMs = parseCheckTimeMs(out);
      results.push({ ...c, checkMs, exitCode: proc.status ?? 0 });
      process.stdout.write(out);
      process.stdout.write('\n');
    }

    process.stdout.write('\nType inference complexity samples:\n');
    for (const r of results) {
      process.stdout.write(
        `- width=${r.width}, depth=${r.depth}, checkMs=${r.checkMs ?? 'n/a'}, exitCode=${r.exitCode}\n`
      );
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

await main();
