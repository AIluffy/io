export type FocusManagerListener = (focused: boolean) => void;

export type FocusManager = {
  isFocused: () => boolean;
  setFocused: (focused: boolean) => void;
  subscribe: (listener: FocusManagerListener) => () => void;
  destroy: () => void;
};

let focusManager: FocusManager | undefined;

type RuntimeWindow = {
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

type RuntimeDocument = {
  visibilityState?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
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
  let destroyed = false;
  const listeners = new Set<FocusManagerListener>();

  const notify = (): void => {
    for (const listener of listeners) {
      listener(focused);
    }
  };

  const setFocused = (next: boolean): void => {
    if (destroyed || focused === next) {
      return;
    }
    focused = next;
    notify();
  };

  const runtimeWindow = getRuntimeWindow();
  const runtimeDocument = getRuntimeDocument();

  const onFocus = (): void => {
    setFocused(true);
  };
  const onBlur = (): void => {
    setFocused(false);
  };
  const onVisibilityChange = (): void => {
    setFocused(getDocumentVisibility());
  };

  if (runtimeWindow && runtimeDocument) {
    runtimeWindow.addEventListener?.('focus', onFocus);
    runtimeWindow.addEventListener?.('blur', onBlur);
    runtimeDocument.addEventListener?.('visibilitychange', onVisibilityChange);
  }

  const destroy = (): void => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    listeners.clear();
    runtimeWindow?.removeEventListener?.('focus', onFocus);
    runtimeWindow?.removeEventListener?.('blur', onBlur);
    runtimeDocument?.removeEventListener?.('visibilitychange', onVisibilityChange);
  };

  return {
    isFocused: () => focused,
    setFocused,
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

export function getFocusManager(): FocusManager {
  if (!focusManager) {
    focusManager = createFocusManager();
  }
  return focusManager;
}

export function resetFocusManager(): void {
  focusManager?.destroy();
  focusManager = undefined;
}
