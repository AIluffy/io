export type OnlineManagerListener = (online: boolean) => void;

export type OnlineManager = {
  isOnline: () => boolean;
  setOnline: (online: boolean) => void;
  subscribe: (listener: OnlineManagerListener) => () => void;
};

let onlineManager: OnlineManager | undefined;

type RuntimeWindow = {
  addEventListener?: (type: string, listener: () => void) => void;
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
  const listeners = new Set<OnlineManagerListener>();

  const notify = (): void => {
    for (const listener of listeners) {
      listener(online);
    }
  };

  const setOnline = (next: boolean): void => {
    if (online === next) {
      return;
    }
    online = next;
    notify();
  };

  const runtimeWindow = getRuntimeWindow();
  if (runtimeWindow) {
    runtimeWindow.addEventListener?.('online', () => {
      setOnline(true);
    });
    runtimeWindow.addEventListener?.('offline', () => {
      setOnline(false);
    });
  }

  return {
    isOnline: () => online,
    setOnline,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function getOnlineManager(): OnlineManager {
  if (!onlineManager) {
    onlineManager = createOnlineManager();
  }
  return onlineManager;
}
