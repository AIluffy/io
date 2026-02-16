import { describe, expect, it } from 'vitest';
import { derived } from '../core/api/derived.js';
import { io } from '../core/api/io.js';
import { getValueView } from '../core/api/utils/value-view.js';
import { INTERNAL } from '../utils/internal/internal-access.js';

describe('core/api/utils: getValueView', () => {
  it('returns primitives and nullish values as-is', () => {
    expect(getValueView<number>(1)).toBe(1);
    expect(getValueView<null>(null)).toBeNull();
    expect(getValueView<undefined>(undefined)).toBeUndefined();
  });

  it('reads unit and derived values directly', () => {
    const count = io(2);
    const doubled = derived(() => count.get() * 2);

    expect(getValueView<number>(count)).toBe(2);
    expect(getValueView<number>(doubled)).toBe(4);
  });

  it('creates cached proxies for scope and array nodes', () => {
    const tree = io({
      list: [{ value: 1 }, { value: 2 }],
      meta: { tag: 'ok' },
    });

    const view = getValueView<{
      list: Array<{ value: number }>;
      meta: { tag: string };
    }>(tree);
    const cached = getValueView<typeof view>(tree);

    expect(cached).toBe(view);
    expect(view.list[0].value).toBe(1);
    expect(view.list[1].value).toBe(2);
    expect(view.list.length).toBe(2);
    expect(view.meta.tag).toBe('ok');
  });

  it('returns plain child values when nested values are not nodes', () => {
    const view = getValueView<{
      label: string;
      nested: { active: boolean };
    }>({
      label: 'x',
      nested: { active: true },
    });

    expect(view.label).toBe('x');
    expect(view.nested.active).toBe(true);
    expect(Reflect.get(view as object, INTERNAL)).toBeUndefined();
  });
});
