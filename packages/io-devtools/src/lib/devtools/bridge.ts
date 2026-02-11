import type {
  IoDevtoolsBridge,
  IoDevtoolsEvent,
  IoDevtoolsOptions,
  IoDevtoolsState,
  IoDevtoolsTarget,
  IoHistoryEntry,
  Unsubscribe,
} from '../types.js';

type ReduxExtension = {
  connect: (options: { name: string }) => {
    init: (state: unknown) => void;
    send: (action: { type: string }, state: unknown) => void;
    subscribe: (fn: (message: unknown) => void) => void;
    unsubscribe: () => void;
  };
};

type BridgeDeps = {
  target: IoDevtoolsTarget;
  options?: IoDevtoolsOptions;
  listeners: Set<(event: IoDevtoolsEvent) => void>;
  emit: (event: IoDevtoolsEvent) => void;
  getState: () => IoDevtoolsState;
  reportDevtoolsError: (error: unknown, source: 'bridge') => void;
  history: IoHistoryEntry[];
  clearHistory: () => void;
  resetSnapshots: (next: unknown) => void;
  goTo: (index: number) => boolean;
  withTimeTraveling: <T>(fn: () => T) => T;
  sanitizeForJson: (
    value: unknown,
    options?: IoDevtoolsOptions['export'],
  ) => unknown;
};

function getReduxExtension(win: unknown): ReduxExtension | null {
  const w = win as Record<string, unknown> | null | undefined;
  const ext = w?.__REDUX_DEVTOOLS_EXTENSION__ as unknown;
  if (!ext) return null;
  if (typeof (ext as ReduxExtension).connect !== 'function') return null;
  return ext as ReduxExtension;
}

export function createReduxBridgeConnector(deps: BridgeDeps) {
  return (bridgeOptions?: {
    window?: unknown;
    name?: string;
  }): IoDevtoolsBridge | null => {
    const enabledByConfig = deps.options?.reduxDevTools?.enabled ?? false;
    if (!enabledByConfig) return null;
    const win = bridgeOptions?.window ?? (globalThis as unknown);
    const ext = getReduxExtension(win);
    if (!ext) return null;
    const name =
      bridgeOptions?.name ??
      deps.options?.reduxDevTools?.name ??
      deps.options?.name ??
      'IO';

    const connection = ext.connect({ name });
    connection.init(
      deps.sanitizeForJson(deps.target.snapshot(), deps.options?.export),
    );

    const onBridgeUpdate = (event: IoDevtoolsEvent) => {
      if (event.type !== 'mutation') return;
      const index = deps.history.length - 1;
      const actionType = `IO/${index + 1}`;
      const state = deps.sanitizeForJson(
        deps.target.snapshot(),
        deps.options?.export,
      );
      try {
        connection.send({ type: actionType }, state);
      } catch (error) {
        deps.reportDevtoolsError(error, 'bridge');
      }
    };

    const unsub = ((): Unsubscribe => {
      const fn = (event: IoDevtoolsEvent) => onBridgeUpdate(event);
      deps.listeners.add(fn);
      return () => deps.listeners.delete(fn);
    })();

    const handleMessage = (message: unknown) => {
      const m = message as {
        type?: unknown;
        payload?: unknown;
        state?: unknown;
      };
      if (m?.type !== 'DISPATCH') return;
      const payload = m.payload as
        | { type?: unknown; actionId?: unknown }
        | undefined;
      const dispatchType = payload?.type;
      if (dispatchType === 'RESET') {
        deps.clearHistory();
        connection.init(
          deps.sanitizeForJson(deps.target.snapshot(), deps.options?.export),
        );
        return;
      }
      if (dispatchType === 'COMMIT') {
        deps.clearHistory();
        const snapshot = deps.target.snapshot();
        deps.resetSnapshots(snapshot);
        connection.init(
          deps.sanitizeForJson(snapshot, deps.options?.export),
        );
        return;
      }
      if (
        dispatchType === 'JUMP_TO_ACTION' ||
        dispatchType === 'JUMP_TO_STATE'
      ) {
        const actionIdRaw = payload?.actionId;
        const actionId =
          typeof actionIdRaw === 'number'
            ? actionIdRaw
            : typeof actionIdRaw === 'string'
              ? Number(actionIdRaw)
              : NaN;
        if (!Number.isFinite(actionId)) return;
        const nextIndex = actionId - 1;
        deps.withTimeTraveling(() => deps.goTo(nextIndex));
      }
    };

    connection.subscribe(handleMessage);

    deps.emit({ type: 'bridge', connected: true, state: deps.getState() });

    const bridge: IoDevtoolsBridge = {
      disconnect: () => {
        try {
          unsub();
          connection.unsubscribe();
        } catch (error) {
          deps.reportDevtoolsError(error, 'bridge');
        } finally {
          deps.emit({ type: 'bridge', connected: false, state: deps.getState() });
        }
      },
    };
    return bridge;
  };
}
