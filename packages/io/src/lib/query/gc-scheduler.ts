export type GcSchedulerOptions = {
  getGcTime: () => number;
  hasObservers: () => boolean;
  hasInFlight: () => boolean;
  onCollect: () => void;
};

export type GcScheduler = {
  schedule: () => void;
  clear: () => void;
  touch: () => void;
};

export function createGcScheduler(options: GcSchedulerOptions): GcScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = (): void => {
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    timer = null;
  };

  const schedule = (): void => {
    clear();

    if (options.hasObservers() || options.hasInFlight()) {
      return;
    }

    const gcTime = options.getGcTime();
    if (!Number.isFinite(gcTime) || gcTime < 0) {
      return;
    }

    timer = setTimeout(() => {
      timer = null;
      if (options.hasObservers() || options.hasInFlight()) {
        return;
      }
      options.onCollect();
    }, gcTime);

    if (timer && typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref: () => void }).unref();
    }
  };

  return {
    schedule,
    clear,
    touch: clear,
  };
}
