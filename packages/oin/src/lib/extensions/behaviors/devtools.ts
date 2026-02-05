import type { OinBehavior, OinView, OinViewExtensions } from '../types.js';

export type DevtoolsFactory = (target: unknown, options?: unknown) => unknown;

export type DevtoolsBehaviorOptions = {
  target: unknown;
  create: DevtoolsFactory;
  options?: unknown;
  key?: string;
};

export function devtools<T>(config: DevtoolsBehaviorOptions): OinBehavior<T> {
  return (view: OinView<T>) => {
    const instance = config.create(config.target, config.options);
    const key = config.key ?? 'devtools';
    const extensions: OinViewExtensions = { ...(view.extensions ?? {}) };
    extensions[key] = instance;
    const prevDestroy = view.destroy;
    const destroy = () => {
      const maybeDestroy = instance as { destroy?: unknown };
      if (typeof maybeDestroy.destroy === 'function') {
        maybeDestroy.destroy();
      }
      prevDestroy?.();
    };
    return {
      ...view,
      extensions,
      destroy,
    };
  };
}
