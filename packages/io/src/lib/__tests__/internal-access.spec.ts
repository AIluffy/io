import { describe, expect, it } from 'vitest';
import {
  getInternal,
  registerInternal,
  requireInternal,
  requireInternalOfKind,
} from '../utils/internal/internal-access.js';

describe('utils/internal/internal-access', () => {
  it('stores internals in weak map for non-extensible targets', () => {
    const target = Object.preventExtensions({});
    registerInternal(target, { kind: 'unit', value: 1 });

    expect(getInternal(target)).toMatchObject({ kind: 'unit', value: 1 });
  });

  it('validates required internals and kind', () => {
    expect(() => requireInternal({}, 'missing')).toThrow('missing');

    const target = {};
    registerInternal(target, { kind: 'scope', ok: true });
    expect(requireInternal(target, 'missing')).toMatchObject({ kind: 'scope' });
    expect(() =>
      requireInternalOfKind(target, 'unit', 'wrong kind'),
    ).toThrow('wrong kind');
  });
});
