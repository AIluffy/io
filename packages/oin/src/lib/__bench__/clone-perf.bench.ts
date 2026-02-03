import { bench, describe } from 'vitest';
import { createDraft, finishDraft } from '../utils/cow.js';
import { cloneValue, __testing } from '../utils/snapshot.js';

type Fixture = {
  level1: {
    level2: {
      level3: {
        level4: { level5: { value: number }; extra: number };
      };
    };
  };
  list: Array<{ id: string; meta: { n: number } }>;
};

function legacyCloneValue<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  const maybeStructuredClone = (globalThis as Record<PropertyKey, unknown>)
    .structuredClone;
  if (typeof maybeStructuredClone === 'function') {
    return (maybeStructuredClone as (v: unknown) => unknown)(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function mutateDeep(obj: Fixture, n: number): void {
  obj.level1.level2.level3.level4.level5.value = n;
  obj.level1.level2.level3.level4.extra = n;
  obj.list.splice(2, 1, { id: String(n), meta: { n } });
}

function buildFixture(): Fixture {
  return {
    level1: {
      level2: {
        level3: { level4: { level5: { value: 0 }, extra: 0 } },
      },
    },
    list: Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      meta: { n: i },
    })),
  };
}

describe('clone performance', () => {
  bench('legacy: deep clone per draft', () => {
    let before = buildFixture();
    for (let i = 0; i < 200; i += 1) {
      const draft = legacyCloneValue(before);
      mutateDeep(draft, i);
      before = draft;
    }
  });

  bench('new: COW draft (structural sharing)', () => {
    const before0 = cloneValue(buildFixture());
    __testing.resetDeepCloneCount();
    let before = before0;
    for (let i = 0; i < 200; i += 1) {
      const draft = createDraft(before);
      mutateDeep(draft, i);
      before = finishDraft(draft);
    }
  });
});