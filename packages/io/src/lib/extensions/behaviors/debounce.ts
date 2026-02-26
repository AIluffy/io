import type { IoBehavior, IoView } from '../types.js';

export type DebounceBehaviorOptions = {
  leading?: boolean;
  trailing?: boolean;
};

export function debounce<T>(
  waitMs: number,
  options: DebounceBehaviorOptions = {},
): IoBehavior<T> {
  const delay = Math.max(0, waitMs);
  const leading = options.leading ?? false;
  const trailing = options.trailing ?? true;

  return (view: IoView<T>) => {
    const wrapped = Object.create(view) as IoView<T> & {
      subscribe: (fn: (value: T) => void) => () => void;
    };

    Object.defineProperty(wrapped, 'subscribe', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: (fn: (value: T) => void) => {
        let active = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let hasTrailing = false;
        let last = view.get();

        const clearTimer = () => {
          if (timer === undefined) return;
          clearTimeout(timer);
          timer = undefined;
        };

        const unsub = view.subscribe((value) => {
          last = value;

          if (delay <= 0) {
            if (leading || trailing) {
              fn(last);
            }
            return;
          }

          const firstInBurst = timer === undefined;
          if (leading && firstInBurst) {
            fn(last);
          }
          if (trailing && (!leading || !firstInBurst)) {
            hasTrailing = true;
          }

          clearTimer();
          timer = setTimeout(() => {
            timer = undefined;
            if (!active) return;
            if (trailing && (!leading || hasTrailing)) {
              fn(last);
            }
            hasTrailing = false;
          }, delay);
        });

        return () => {
          active = false;
          hasTrailing = false;
          clearTimer();
          unsub();
        };
      },
    });

    return wrapped;
  };
}
