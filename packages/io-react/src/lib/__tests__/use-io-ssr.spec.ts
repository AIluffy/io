import { describe, expect, it, vi } from 'vitest';

type IoGlobal = {
  window?: unknown;
  document?: unknown;
};

describe('@iostore/react SSR', () => {
  it('treats missing window/document as server environment', async () => {
    const ioGlobal = globalThis as unknown as IoGlobal;
    const previousWindow = ioGlobal.window;
    const previousDocument = ioGlobal.document;
    delete ioGlobal.window;
    delete ioGlobal.document;

    vi.resetModules();
    vi.doMock('react', () => ({
      useSyncExternalStore: (
        subscribe: (onStoreChange: () => void) => () => void,
        _getSnapshot: () => number,
        getServerSnapshot: () => number,
      ) => {
        const unsub = subscribe(() => undefined);
        unsub();
        return getServerSnapshot();
      },
    }));

    try {
      const subscribe = vi.fn(() => () => undefined);
      const source = {
        snapshot: () => 7,
        subscribe,
      };
      const { useIO } = await import('../use-io.js');
      const value = useIO(source);

      expect(value).toBe(7);
      expect(subscribe).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('react');
      vi.resetModules();
      ioGlobal.window = previousWindow;
      ioGlobal.document = previousDocument;
    }
  });
});
