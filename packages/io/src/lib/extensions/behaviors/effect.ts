import type { IoBehavior, IoView } from '../types.js';

export type EffectBehaviorOptions = {
  immediate?: boolean;
  onError?: (error: unknown) => void;
};

type EffectCleanup = void | (() => void);

function callEffectCleanup(cleanup: EffectCleanup): void {
  if (typeof cleanup === 'function') {
    cleanup();
  }
}

export function effect<T>(
  fn: (value: T, previous: T | undefined) => EffectCleanup,
  options?: EffectBehaviorOptions,
): IoBehavior<T> {
  const immediate = options?.immediate ?? true;
  const reportError = (error: unknown): void => {
    if (typeof options?.onError === 'function') {
      options.onError(error);
      return;
    }
    throw error;
  };

  return (view: IoView<T>) => {
    let destroyed = false;
    let previous: T | undefined;
    let hasPrevious = false;
    let cleanup: EffectCleanup;

    const run = (value: T) => {
      try {
        callEffectCleanup(cleanup);
        cleanup = fn(value, hasPrevious ? previous : undefined);
        previous = value;
        hasPrevious = true;
      } catch (error) {
        reportError(error);
      }
    };

    const unsub = view.subscribe((value) => {
      if (destroyed) return;
      run(value);
    });

    if (immediate) {
      run(view.get());
    }

    const prevDestroy = view.destroy;
    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      unsub();
      try {
        callEffectCleanup(cleanup);
      } catch (error) {
        reportError(error);
      } finally {
        cleanup = undefined;
      }
      prevDestroy?.();
    };

    return {
      ...view,
      destroy,
    };
  };
}
