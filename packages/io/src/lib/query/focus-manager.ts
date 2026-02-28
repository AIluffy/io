export type FocusManagerListener = (focused: boolean) => void;

export type FocusManager = {
  isFocused: () => boolean;
  setFocused: (focused: boolean) => void;
  subscribe: (listener: FocusManagerListener) => () => void;
};

let focusManager: FocusManager | undefined;

type RuntimeWindow = {
  addEventListener?: (type: string, listener: () => void) => void;
};

type RuntimeDocument = {
  visibilityState?: string;
  addEventListener?: (type: string, listener: () => void) => void;
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

function getRuntimeDocument(): RuntimeDocument | undefined {
  if (typeof globalThis !== 'object' || globalThis === null) {
    return undefined;
  }
  if (!('document' in globalThis)) {
    return undefined;
  }
  return (globalThis as { document?: RuntimeDocument }).document;
}

function getDocumentVisibility(): boolean {
  const runtimeDocument = getRuntimeDocument();
  if (!runtimeDocument) {
    return true;
  }
  return runtimeDocument.visibilityState !== 'hidden';
}

function createFocusManager(): FocusManager {
  let focused = getDocumentVisibility();
  const listeners = new Set<FocusManagerListener>();

  const notify = (): void => {
    for (const listener of listeners) {
      listener(focused);
    }
  };

  const setFocused = (next: boolean): void => {
    if (focused === next) {
      return;
    }
    focused = next;
    notify();
  };

  const runtimeWindow = getRuntimeWindow();
  const runtimeDocument = getRuntimeDocument();

  if (runtimeWindow && runtimeDocument) {
    runtimeWindow.addEventListener?.('focus', () => {
      setFocused(true);
    });
    runtimeWindow.addEventListener?.('blur', () => {
      setFocused(false);
    });
    runtimeDocument.addEventListener?.('visibilitychange', () => {
      setFocused(getDocumentVisibility());
    });
  }

  return {
    isFocused: () => focused,
    setFocused,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function getFocusManager(): FocusManager {
  if (!focusManager) {
    focusManager = createFocusManager();
  }
  return focusManager;
}
