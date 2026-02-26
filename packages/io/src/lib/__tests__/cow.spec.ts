import { describe, expect, it } from 'vitest';
import { createDraft, finishDraft } from '../utils/immutable/cow.js';

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

  it('reuses draft instance for the same base object', () => {
    const base = Object.freeze({ n: 1 });
    const draftA = createDraft(base);
    const draftB = createDraft(base);

    expect(draftA).toBe(draftB);
  });

  it('supports delete and property reflection traps', () => {
    const base = Object.freeze({
      keep: 1,
      drop: 2,
    });
    const draft = createDraft(base) as DeepWritable<typeof base>;

    expect('drop' in draft).toBe(true);
    expect(Reflect.ownKeys(draft)).toEqual(['keep', 'drop']);
    delete (draft as { drop?: number }).drop;

    const next = finishDraft(draft);
    expect(next).toEqual({ keep: 1 });
    expect('drop' in next).toBe(false);
  });

  it('finalizes unchanged child drafts with structural sharing', () => {
    const base = Object.freeze({
      user: Object.freeze({
        profile: Object.freeze({ age: 1 }),
      }),
    });
    const draft = createDraft(base) as DeepWritable<typeof base>;

    // read nested draft but do not mutate
    expect(draft.user.profile.age).toBe(1);

    const next = finishDraft(draft);
    expect(next).toBe(base);
  });

  it('returns primitive inputs unchanged', () => {
    expect(createDraft(1)).toBe(1);
    expect(finishDraft(1)).toBe(1);
  });

  it('normalizes draft values assigned back into a draft tree', () => {
    const base: {
      readonly target: { readonly age: number };
      readonly source: { readonly age: number };
    } = Object.freeze({
      target: Object.freeze({ age: 1 }),
      source: Object.freeze({ age: 2 }),
    });
    const draft = createDraft(base) as DeepWritable<typeof base>;
    const sourceDraft = draft.source;

    draft.target = sourceDraft;
    const next = finishDraft(draft);

    expect(next).toEqual({
      target: { age: 2 },
      source: { age: 2 },
    });
    expect(Object.isFrozen(next.target)).toBe(true);
    expect(next.target).toStrictEqual(next.source);
  });

  it('invalidates last-draft cache after overwrite and delete', () => {
    const base: {
      readonly item: { readonly n: number };
    } = Object.freeze({
      item: Object.freeze({ n: 1 }),
    });
    const draft = createDraft(base) as DeepWritable<typeof base>;
    const firstRead = draft.item;

    draft.item = { n: 2 };
    expect(draft.item).toEqual({ n: 2 });
    expect(draft.item).not.toBe(firstRead);

    delete (draft as { item?: { n: number } }).item;
    expect('item' in draft).toBe(false);
  });

  it('supports multiple array mutators on writable copy', () => {
    const base = Object.freeze([3, 1, 2]);
    const draft = createDraft(base) as number[];

    draft.sort((a, b) => a - b);
    draft.reverse();
    const removed = draft.pop();

    const next = finishDraft(draft);
    expect(removed).toBe(1);
    expect(next).toEqual([3, 2]);
  });

  it('returns finalized proxy unchanged on repeated finishDraft calls', () => {
    const base = Object.freeze({ n: 1 });
    const draft = createDraft(base);
    finishDraft(draft);

    expect(finishDraft(draft)).toBe(draft);
  });

  it('reuses cached child draft after switching access to another key', () => {
    const base = Object.freeze({
      left: Object.freeze({ n: 1 }),
      right: Object.freeze({ n: 2 }),
    });
    const draft = createDraft(base) as DeepWritable<typeof base>;

    const firstLeft = draft.left;
    expect(draft.right.n).toBe(2);
    const secondLeft = draft.left;

    expect(secondLeft).toBe(firstLeft);
  });
});
