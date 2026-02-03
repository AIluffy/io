import { describe, expect, it } from 'vitest';
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
  list: number[];
};

function legacyCloneValue<T>(value: T, counter: { deepClones: number }): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  counter.deepClones += 1;
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
  obj.list.splice(2, 1, n);
}

function buildFixture(): Fixture {
  return {
    level1: {
      level2: {
        level3: { level4: { level5: { value: 0 }, extra: 0 } },
      },
    },
    list: Array.from({ length: 200 }, (_, i) => i),
  };
}

describe('clone strategy', () => {
  it('reduces deep clone count by >80% vs legacy deep clone draft', () => {
    const initial = buildFixture();
    const before0 = cloneValue(initial);

    __testing.resetDeepCloneCount();
    let before = before0;
    for (let i = 0; i < 200; i += 1) {
      const draft = createDraft(before);
      mutateDeep(draft, i);
      before = finishDraft(draft);
    }
    const newDeepClones = __testing.getDeepCloneCount();

    const counter = { deepClones: 0 };
    let legacyBefore = before0;
    for (let i = 0; i < 200; i += 1) {
      const draft = legacyCloneValue(legacyBefore, counter);
      mutateDeep(draft, i);
      legacyBefore = draft;
    }
    const legacyDeepClones = counter.deepClones;

    expect(newDeepClones).toBeLessThanOrEqual(legacyDeepClones * 0.2);
  });
});