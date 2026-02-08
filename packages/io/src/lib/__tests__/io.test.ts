import { describe, expect, it } from 'vitest';
import { io } from '../core/io.js';

describe('io: primitive', () => {
  it('handles string', () => {
    const v = io('a');
    expect(v.snapshot()).toBe('a');
    expect(v.snapshot()).toMatchSnapshot();
  });

  it('handles number', () => {
    const v = io(1);
    expect(v.snapshot()).toBe(1);
    expect(v.snapshot()).toMatchSnapshot();
  });

  it('handles boolean', () => {
    const v = io(true);
    expect(v.snapshot()).toBe(true);
    expect(v.snapshot()).toMatchSnapshot();
  });

  it('handles null', () => {
    const v = io(null);
    expect(v.snapshot()).toBeNull();
    expect(v.snapshot()).toMatchSnapshot();
  });

  it('handles undefined', () => {
    const v = io(undefined);
    expect(v.snapshot()).toBeUndefined();
    expect(v.snapshot()).toMatchSnapshot();
  });

  it('handles symbol', () => {
    const v = io(Symbol.for('io-test'));
    expect(typeof v.snapshot()).toBe('symbol');
    expect(String(v.snapshot())).toMatchSnapshot();
  });
});

describe('io: array', () => {
  it('handles empty array', () => {
    const a = io([] as unknown[]);
    expect(a.snapshot()).toEqual([]);
    expect(a.snapshot()).toMatchSnapshot();
  });

  it('handles primitive array', () => {
    const a = io([1, 'a', true, null, undefined] as const);
    expect(a.snapshot()).toMatchSnapshot();
  });

  it('deep-processes object array items', () => {
    const a = io([{ n: 1 }, { n: 2 }]);
    expect(a[0].n.get()).toBe(1);
    expect(a[1].n.get()).toBe(2);
    a[0].n.set(10);
    expect(a.snapshot()).toMatchSnapshot();
  });

  it('deep-processes nested arrays and objects', () => {
    const a = io([{ a: [{ b: 1 }] }, [{ c: 2 }]] as unknown[]);
    expect((a[0] as any).a[0].b.get()).toBe(1);
    expect((a[1] as any)[0].c.get()).toBe(2);
    (a[0] as any).a[0].b.set(10);
    (a[1] as any)[0].c.set(20);
    expect(a.snapshot()).toMatchSnapshot();
  });

  it('handles sparse arrays', () => {
    const input = Array(3) as unknown[];
    input[0] = 1;
    input[2] = 3;
    const a = io(input);
    expect(a.snapshot()).toEqual([1, undefined, 3]);
    expect(a[1].get()).toBeUndefined();
    expect(a.snapshot()).toMatchSnapshot();
  });

  it('supports reduce and iterator', () => {
    const a = io([1, 2, 3]);
    const sum = a.reduce((acc, item) => acc + item.get(), 0);
    expect(sum).toBe(6);
    const values = Array.from(a, (n) => n.get());
    expect(values).toEqual([1, 2, 3]);
  });
});

describe('io: object', () => {
  it('handles flat objects', () => {
    const o = io({ a: 1, b: 'x' });
    expect(o.a.get()).toBe(1);
    expect(o.b.get()).toBe('x');
    expect(o.snapshot()).toMatchSnapshot();
  });

  it('handles deep nested objects', () => {
    const o = io({ a: { b: { c: 1 } } });
    expect(o.a.b.c.get()).toBe(1);
    o.a.b.c.set(2);
    expect(o.snapshot()).toMatchSnapshot();
  });

  it('handles object with array property', () => {
    const o = io({ list: [{ n: 1 }] });
    expect(o.list[0].n.get()).toBe(1);
    o.list[0].n.set(2);
    expect(o.snapshot()).toMatchSnapshot();
  });

  it('handles circular references', () => {
    const input: any = { x: 1 };
    input.self = input;
    const o: any = io(input);
    expect(o.self).toBe(o);
    const updates: unknown[] = [];
    o.subscribeUpdate((u: unknown) => updates.push(u));
    expect(() => o.snapshot()).not.toThrow();
    const snap: any = o.snapshot();
    expect(snap.self).toBe(snap);
    expect(updates).toHaveLength(0);
  });

  it('includes non-enumerable properties', () => {
    const input: any = {};
    Object.defineProperty(input, 'hidden', {
      value: { n: 1 },
      enumerable: false,
      configurable: true,
    });
    const o: any = io(input);
    expect(Reflect.ownKeys(o)).toContain('hidden');
    expect(o.hidden.n.get()).toBe(1);
  });

  it('includes symbol keys', () => {
    const k = Symbol('k');
    const input: any = { [k]: { n: 1 } };
    const o: any = io(input);
    expect(Reflect.ownKeys(o)).toContain(k);
    expect(o[k].n.get()).toBe(1);
  });
});

describe('io: shallow', () => {
  it('shallow-processes objects', () => {
    const o: any = io({ a: { b: 1 }, n: 1 }, { shallow: true });
    expect(typeof o.a.get).toBe('function');
    expect(o.a.get()).toEqual({ b: 1 });
    expect(o.snapshot()).toEqual({ a: { b: 1 }, n: 1 });
    o.a.update((prev: any) => ({ ...prev, b: 2 }));
    expect(o.snapshot()).toEqual({ a: { b: 2 }, n: 1 });
  });

  it('shallow-processes arrays', () => {
    const a: any = io([{ n: 1 }, { n: 2 }], { shallow: true });
    expect(typeof a[0].get).toBe('function');
    expect(a[0].get()).toEqual({ n: 1 });
    expect(a[1].get()).toEqual({ n: 2 });
    a[0].set({ n: 10 });
    expect(a.snapshot()).toEqual([{ n: 10 }, { n: 2 }]);
  });

  it('deep mode rejects non-plain objects', () => {
    const d = new Date(0);
    expect(() => io(d)).toThrow(TypeError);
  });

  it('shallow mode accepts non-plain objects', () => {
    const d = new Date(0);
    const u: any = io(d, { shallow: true });
    expect(u.snapshot()).toBeInstanceOf(Date);
  });

  it('shallow mode includes non-enumerable properties', () => {
    const input: any = {};
    Object.defineProperty(input, 'hidden', {
      value: { n: 1 },
      enumerable: false,
      configurable: true,
    });
    const o: any = io(input, { shallow: true });
    expect(Reflect.ownKeys(o)).toContain('hidden');
    expect(o.hidden.get()).toEqual({ n: 1 });
    expect(Reflect.ownKeys(o.snapshot())).toContain('hidden');
  });

  it('shallow mode includes symbol keys', () => {
    const k = Symbol('k');
    const input: any = { [k]: { n: 1 } };
    const o: any = io(input, { shallow: true });
    expect(Reflect.ownKeys(o)).toContain(k);
    expect(o[k].get()).toEqual({ n: 1 });
    expect(Reflect.ownKeys(o.snapshot())).toContain(k);
  });

  it('shallow commit rejects unknown keys', () => {
    const o: any = io({ a: 1 }, { shallow: true });
    expect(() => {
      o.commit((draft: any) => {
        draft.b = 2;
      });
    }).toThrow(/unknown key/);
  });

  it('shallow array commit applies draft changes', () => {
    const a: any = io([1, 2, 3], { shallow: true });
    a.commit((draft: number[]) => {
      draft[1] = 10;
      draft.push(4);
    });
    expect(a.snapshot()).toEqual([1, 10, 3, 4]);
  });
});
