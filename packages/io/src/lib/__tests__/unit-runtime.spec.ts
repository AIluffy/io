import { describe, expect, it } from 'vitest';
import { onError } from '../utils/debug/debug.js';
import { INTERNAL } from '../utils/internal/internal-access.js';
import { createUnit } from '../units/unit.js';
import { io } from '../core/api/io.js';

describe('units/runtime branches', () => {
  it('emits onError when set updater throws', () => {
    const unit = io(1);
    const seen: Array<{ op: string; path: readonly PropertyKey[] }> = [];
    const unsub = onError(unit, (_error, path, op) => {
      seen.push({ op, path });
    });

    expect(() =>
      unit.set(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    unsub();

    expect(seen).toEqual([{ op: 'set', path: [] }]);
  });

  it('emits onError when reset cloning fails', () => {
    const unit = createUnit(new Date('2024-01-01T00:00:00.000Z'));
    const seen: string[] = [];
    const unsub = onError(unit, (_error, _path, op) => {
      seen.push(op);
    });
    const internal = (unit as Record<PropertyKey, unknown>)[INTERNAL] as {
      getState: () => { initial: unknown };
    };
    internal.getState().initial = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('clone failed');
        },
      },
    );

    try {
      expect(() => unit.reset()).toThrow('clone failed');
    } finally {
      unsub();
    }

    expect(seen).toEqual(['reset']);
  });
});
