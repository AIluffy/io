import { describe, expect, it } from 'vitest';
import { createDraft, finishDraft } from '../utils/cow.js';

type DeepWritable<T> = T extends readonly (infer U)[]
  ? DeepWritable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepWritable<T[K]> }
    : T;

type UserProfileState = {
  readonly user: {
    readonly profile: {
      readonly age: number;
    };
  };
};

describe('cow', () => {
  it('returns base reference when draft is unchanged', () => {
    const base = Object.freeze({
      user: Object.freeze({ profile: Object.freeze({ age: 1 }) }),
    });

    const draft = createDraft(base);
    const next = finishDraft(draft);

    expect(next).toBe(base);
  });

  it('finalizes nested object writes even when parent is not directly written', () => {
    const base: UserProfileState = Object.freeze({
      user: Object.freeze({ profile: Object.freeze({ age: 1 }) }),
    });

    const draft = createDraft(base) as DeepWritable<typeof base>;
    draft.user.profile.age = 2;
    const next = finishDraft(draft);

    expect(next).toEqual({ user: { profile: { age: 2 } } });
    expect(next).not.toBe(base);
    expect(next.user).not.toBe(base.user);
  });

  it('finalizes nested array mutator writes', () => {
    const base = Object.freeze({
      items: Object.freeze([1, 2]),
    });

    const draft = createDraft(base) as DeepWritable<typeof base>;
    draft.items.push(3);
    const next = finishDraft(draft);

    expect(next).toEqual({ items: [1, 2, 3] });
    expect(next.items).not.toBe(base.items);
  });
});
