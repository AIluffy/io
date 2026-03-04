export type OnlineManagerListener = (online: boolean) => void;

export type OnlineManager = {
  isOnline: () => boolean;
  setOnline: (online: boolean) => void;
  subscribe: (listener: OnlineManagerListener) => () => void;
  destroy: () => void;
};

let onlineManager: OnlineManager | undefined;

type RuntimeWindow = {
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

type RuntimeNavigator = {
  onLine?: boolean;
};

function getRuntimeWindow(): RuntimeWindow | undefined {
  if (typeof globalThis !== 'object' || globalThis === null) {
    return undefined;
  }
  if (!('window' in globalThis)) {
    return undefined;
  }
  return (globalThis as { window?: RuntimeWindow }).window;
}

function getRuntimeNavigator(): RuntimeNavigator | undefined {
  if (typeof globalThis !== 'object' || globalThis === null) {
    return undefined;
  }
  if (!('navigator' in globalThis)) {
    return undefined;
  }
  return (globalThis as { navigator?: RuntimeNavigator }).navigator;
}

function getNavigatorOnline(): boolean {
  const runtimeNavigator = getRuntimeNavigator();
  if (!runtimeNavigator || typeof runtimeNavigator.onLine !== 'boolean') {
    return true;
  }
  return runtimeNavigator.onLine;
}

function createOnlineManager(): OnlineManager {
  let online = getNavigatorOnline();
  let destroyed = false;
  const listeners = new Set<OnlineManagerListener>();

  const notify = (): void => {
    for (const listener of listeners) {
      listener(online);
    }
  };

  const setOnline = (next: boolean): void => {
    if (destroyed || online === next) {
      return;
    }
    online = next;
    notify();
  };

  const runtimeWindow = getRuntimeWindow();
  const onOnline = (): void => {
    setOnline(true);
  };
  const onOffline = (): void => {
    setOnline(false);
  };

  if (runtimeWindow) {
    runtimeWindow.addEventListener?.('online', onOnline);
    runtimeWindow.addEventListener?.('offline', onOffline);
  }

  const destroy = (): void => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    listeners.clear();
    runtimeWindow?.removeEventListener?.('online', onOnline);
    runtimeWindow?.removeEventListener?.('offline', onOffline);
  };

  return {
    isOnline: () => online,
    setOnline,
    subscribe: (listener) => {
      if (destroyed) {
        return () => undefined;
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy,
  };
}

export function getOnlineManager(): OnlineManager {
  if (!onlineManager) {
    onlineManager = createOnlineManager();
  }
  return onlineManager;
}

export function resetOnlineManager(): void {
  onlineManager?.destroy();
  onlineManager = undefined;
}
