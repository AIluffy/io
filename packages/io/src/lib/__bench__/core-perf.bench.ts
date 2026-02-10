import { bench, describe } from 'vitest';
import { io } from '../core/io.js';
import { createDraft, finishDraft } from '../utils/cow.js';
import { batch } from '../utils/batch.js';
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
