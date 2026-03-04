import * as React from 'react';

type ReactUse = <T>(usable: PromiseLike<T>) => T;

function getReactUse(): ReactUse | null {
  const maybeUse = (React as { use?: unknown }).use;
  return typeof maybeUse === 'function' ? (maybeUse as ReactUse) : null;
}

export function suspendWithReactUse<T>(
  promise: Promise<T>,
  useReact19: boolean,
): T | undefined {
  if (!useReact19) {
    throw promise;
  }

  const reactUse = getReactUse();
  if (!reactUse) {
    throw promise;
  }

  return reactUse(promise);
}
