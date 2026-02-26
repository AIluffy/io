import type { IoBehavior, IoView } from '../types.js';

export type ThrottleBehaviorOptions = {
  leading?: boolean;
  trailing?: boolean;
};

export function throttle<T>(
  waitMs: number,
  options: ThrottleBehaviorOptions = {},
): IoBehavior<T> {
  const delay = Math.max(0, waitMs);
  const leading = options.leading ?? true;
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
        let cooling = false;
        let hasTrailing = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let last = view.get();

        const clearTimer = () => {
          if (timer === undefined) return;
          clearTimeout(timer);
          timer = undefined;
        };

        const scheduleWindow = () => {
          clearTimer();
          timer = setTimeout(() => {
            timer = undefined;
            if (!active) return;
            if (trailing && hasTrailing) {
              hasTrailing = false;
              fn(last);
              scheduleWindow();
              return;
            }
            cooling = false;
          }, delay);
        };

        const unsub = view.subscribe((value) => {
          last = value;

          if (delay <= 0) {
            if (leading || trailing) {
              fn(last);
            }
            return;
          }

          if (!cooling) {
            cooling = true;
            if (leading) {
              fn(last);
            } else if (trailing) {
              hasTrailing = true;
            }
            scheduleWindow();
            return;
          }

          if (trailing) {
            hasTrailing = true;
          }
        });

        return () => {
          active = false;
          cooling = false;
          hasTrailing = false;
          clearTimer();
          unsub();
        };
      },
    });

    return wrapped;
  };
}
