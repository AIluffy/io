import { bench, describe } from 'vitest';
import { io } from '../core/api/io.js';
import { createDraft, finishDraft } from '../utils/immutable/cow.js';
import { batch } from '../utils/reactive/batch.js';
import { createUnit } from '../units/unit.js';

type DeepState = {
  level1: {
    level2: {
      level3: {
        level4: { level5: { value: number }; extra: number };
      };
    };
  };
  list: Array<{ id: string; meta: { n: number } }>;
};

type DeepNestedNode = { value: number; child?: DeepNestedNode };

function buildDeepState(listSize = 200): DeepState {
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

function buildDeepNested(depth: number): DeepNestedNode {
  const root: DeepNestedNode = { value: 0 };
  let current = root;
  for (let i = 1; i < depth; i += 1) {
    current.child = { value: i };
    current = current.child;
  }
  return root;
}

function buildWideScope(size = 1_000): Record<string, number> {
  const scope: Record<string, number> = {};
  for (let i = 0; i < size; i += 1) {
    scope[`k${i}`] = i;
  }
  return scope;
}

function mutateDeepNested(root: DeepNestedNode, next: number): void {
  let current = root;
  while (current.child) {
    current = current.child;
  }
  current.value = next;
}

function mutateDeep(state: DeepState, n: number): void {
  state.level1.level2.level3.level4.level5.value = n;
  state.level1.level2.level3.level4.extra = n;
  const idx = n % state.list.length;
  state.list.splice(idx, 1, { id: String(n), meta: { n } });
}

describe('core: createUnit', () => {
  bench('createUnit: primitive (1k)', () => {
    for (let i = 0; i < 1_000; i += 1) {
      createUnit(i);
    }
  });

  bench('createUnit: object (1k)', () => {
    for (let i = 0; i < 1_000; i += 1) {
      createUnit({ a: i, b: { c: i } });
    }
  });
});

describe('core: subscribe/unsubscribe', () => {
  bench('subscribe/unsubscribe: value (10k)', () => {
    const unit = createUnit(0);
    const onValue = () => undefined;
    for (let i = 0; i < 10_000; i += 1) {
      const unsub = unit.subscribe(onValue);
      unsub();
    }
  });

  bench('subscribe/unsubscribe: update (10k)', () => {
    const unit = createUnit(0);
    const onUpdate = () => undefined;
    for (let i = 0; i < 10_000; i += 1) {
      const unsub = unit.subscribeUpdate(onUpdate);
      unsub();
    }
  });
});

describe('core: snapshot', () => {
  bench('snapshot: scope (10k)', () => {
    const store = io(buildDeepState(100));
    for (let i = 0; i < 10_000; i += 1) {
      store.snapshot();
    }
  });

  bench('snapshot: array (10k)', () => {
    const list = io(Array.from({ length: 500 }, (_, i) => i));
    for (let i = 0; i < 10_000; i += 1) {
      list.snapshot();
    }
  });

  bench('snapshot: array (20k boundary)', () => {
    const list = io(Array.from({ length: 20_000 }, (_, i) => i));
    for (let i = 0; i < 2_000; i += 1) {
      list.snapshot();
    }
  });

  bench('snapshot: depth (80 boundary)', () => {
    const store = io(buildDeepNested(80));
    for (let i = 0; i < 5_000; i += 1) {
      store.snapshot();
    }
  });
});

describe('core: snapshot scope dirty patterns', () => {
  bench('snapshot: scope sparse dirty key (1k)', () => {
    const store = io(buildWideScope(1_000));
    for (let i = 0; i < 2_000; i += 1) {
      const key = `k${i % 1_000}`;
      store[key].set(i);
      store.snapshot();
    }
  });

  bench('snapshot: scope dense dirty keys (1k)', () => {
    const store = io(buildWideScope(1_000));
    for (let round = 0; round < 20; round += 1) {
      for (let i = 0; i < 1_000; i += 1) {
        store[`k${i}`].set(i + round);
      }
      store.snapshot();
    }
  });
});

describe('core: snapshot array dirty patterns', () => {
  bench('snapshot: array sparse dirty index (1k)', () => {
    const list = io(Array.from({ length: 1_000 }, (_, i) => i));
    for (let i = 0; i < 2_000; i += 1) {
      const index = i % 1_000;
      list[index].set(i);
      list.snapshot();
    }
  });

  bench('snapshot: array dense dirty indices (1k)', () => {
    const list = io(Array.from({ length: 1_000 }, (_, i) => i));
    for (let round = 0; round < 20; round += 1) {
      for (let i = 0; i < 1_000; i += 1) {
        list[i].set(i + round);
      }
      list.snapshot();
    }
  });
});

describe('core: createDraft/finishDraft', () => {
  bench('draft/finish: deep object (200)', () => {
    let before = buildDeepState(200);
    for (let i = 0; i < 200; i += 1) {
      const draft = createDraft(before);
      mutateDeep(draft, i);
      before = finishDraft(draft);
    }
  });
});

describe('core: deep updates', () => {
  bench('commit deep update (200)', () => {
    const store = io(buildDeepState(200));
    for (let i = 0; i < 200; i += 1) {
      store.commit((draft) => {
        mutateDeep(draft, i);
      });
    }
  });

  bench('commit deep update (80 boundary)', () => {
    const store = io(buildDeepNested(80));
    for (let i = 0; i < 1_000; i += 1) {
      store.commit((draft) => {
        mutateDeepNested(draft as DeepNestedNode, i);
      });
    }
  });
});

describe('core: batch vs non-batch', () => {
  bench('batch: 40k updates', () => {
    const count = io(0);
    for (let i = 0; i < 200; i += 1) {
      batch(() => {
        for (let j = 0; j < 200; j += 1) {
          count.set(j);
        }
      });
    }
  });

  bench('no batch: 40k updates', () => {
    const count = io(0);
    for (let i = 0; i < 200; i += 1) {
      for (let j = 0; j < 200; j += 1) {
        count.set(j);
      }
    }
  });
});

describe('core: concurrent updates (multi-unit)', () => {
  bench('batch update 200 units', () => {
    const list = io(Array.from({ length: 200 }, () => 0));
    for (let r = 0; r < 200; r += 1) {
      batch(() => {
        for (let i = 0; i < 200; i += 1) {
          list[i].set(i + r);
        }
      });
    }
  });

  bench('sequential update 200 units', () => {
    const list = io(Array.from({ length: 200 }, () => 0));
    for (let r = 0; r < 200; r += 1) {
      for (let i = 0; i < 200; i += 1) {
        list[i].set(i + r);
      }
    }
  });
});
