import { getInternal } from '../utils/internal/internal-access.js';
import type { IoUpdateAnnotation, IoUnit } from '../utils/types/types.js';

type UnitInternalState<T> = {
  kind: 'unit';
  getValue: () => T;
  setValue: (
    next: T | ((prev: T) => T),
    options?: IoUpdateAnnotation & {
      emitValue?: boolean;
      emitUpdate?: boolean;
    },
  ) => void;
};

function getUnitInternalState<T>(
  unit: IoUnit<T>,
): UnitInternalState<T> | undefined {
  const internal = getInternal(unit);
  if (!internal || internal.kind !== 'unit') {
    return undefined;
  }

  const maybeInternal = internal as Partial<UnitInternalState<T>>;
  if (
    typeof maybeInternal.getValue !== 'function' ||
    typeof maybeInternal.setValue !== 'function'
  ) {
    return undefined;
  }

  return maybeInternal as UnitInternalState<T>;
}

export function readUnitState<T>(unit: IoUnit<T>): T {
  const internal = getUnitInternalState(unit);
  if (internal) {
    return internal.getValue();
  }
  return unit.snapshot();
}

export function setUnitState<T>(
  unit: IoUnit<T>,
  next: T | ((prev: T) => T),
  annotation?: IoUpdateAnnotation,
): void {
  const internal = getUnitInternalState(unit);
  if (internal) {
    internal.setValue(next, annotation);
    return;
  }
  unit.set(next);
}
