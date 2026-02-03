import { describe, expect, it } from 'vitest';
import { oin } from './oin.js';

describe('oin: primitive', () => {
  it('handles string', () => {
    const v = oin('a');
    expect(v.snapshot()).toBe('a');
    expect(v.snapshot()).toMatchSnapshot();
  });

  it('handles number', () => {
    const v = oin(1);
    expect(v.snapshot()).toBe(1);
    expect(v.snapshot()).toMatchSnapshot();
  });

  it('handles boolean', () => {
    const v = oin(true);
    expect(v.snapshot()).toBe(true);
    expect(v.snapshot()).toMatchSnapshot();
  });

  it('handles null', () => {
    const v = oin(null);
    expect(v.snapshot()).toBeNull();
    expect(v.snapshot()).toMatchSnapshot();
  });

  it('handles undefined', () => {
    const v = oin(undefined);
    expect(v.snapshot()).toBeUndefined();
    expect(v.snapshot()).toMatchSnapshot();
  });

  it('handles symbol', () => {
    const v = oin(Symbol.for('oin-test'));
    expect(typeof v.snapshot()).toBe('symbol');
    expect(String(v.snapshot())).toMatchSnapshot();
  });
});

describe('oin: array', () => {
  it('handles empty array', () => {
    const a = oin([] as unknown[]);
    expect(a.snapshot()).toEqual([]);
    expect(a.snapshot()).toMatchSnapshot();
  });

  it('handles primitive array', () => {
    const a = oin([1, 'a', true, null, undefined] as const);
    expect(a.snapshot()).toMatchSnapshot();
  });

  it('deep-processes object array items', () => {
    const a = oin([{ n: 1 }, { n: 2 }]);
    expect(a[0].n()).toBe(1);
    expect(a[1].n()).toBe(2);
    a[0].n(10);
    expect(a.snapshot()).toMatchSnapshot();
  });

  it('deep-processes nested arrays and objects', () => {
    const a = oin([{ a: [{ b: 1 }] }, [{ c: 2 }]] as unknown[]);
    expect((a[0] as any).a[0].b()).toBe(1);
    expect((a[1] as any)[0].c()).toBe(2);
    (a[0] as any).a[0].b(10);
    (a[1] as any)[0].c(20);
    expect(a.snapshot()).toMatchSnapshot();
  });

  it('handles sparse arrays', () => {
    const input = [1, , 3] as unknown[];
    const a = oin(input);
    expect(a.snapshot()).toEqual([1, undefined, 3]);
    expect(a[1]()).toBeUndefined();
    expect(a.snapshot()).toMatchSnapshot();
  });

  it('supports reduce and iterator', () => {
    const a = oin([1, 2, 3]);
    const sum = a.reduce((acc, item) => acc + item(), 0);
    expect(sum).toBe(6);
    const values = Array.from(a, (n) => n());
    expect(values).toEqual([1, 2, 3]);
  });
});

describe('oin: object', () => {
  it('handles flat objects', () => {
    const o = oin({ a: 1, b: 'x' });
    expect(o.a()).toBe(1);
    expect(o.b()).toBe('x');
    expect(o.snapshot()).toMatchSnapshot();
  });

  it('handles deep nested objects', () => {
    const o = oin({ a: { b: { c: 1 } } });
    expect(o.a.b.c()).toBe(1);
    o.a.b.c(2);
    expect(o.snapshot()).toMatchSnapshot();
  });

  it('handles object with array property', () => {
    const o = oin({ list: [{ n: 1 }] });
    expect(o.list[0].n()).toBe(1);
    o.list[0].n(2);
    expect(o.snapshot()).toMatchSnapshot();
  });

  it('handles circular references', () => {
    const input: any = { x: 1 };
    input.self = input;
    const o: any = oin(input);
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
    const o: any = oin(input);
    expect(Reflect.ownKeys(o)).toContain('hidden');
    expect(o.hidden.n()).toBe(1);
  });

  it('includes symbol keys', () => {
    const k = Symbol('k');
    const input: any = { [k]: { n: 1 } };
    const o: any = oin(input);
    expect(Reflect.ownKeys(o)).toContain(k);
    expect(o[k].n()).toBe(1);
  });
});

