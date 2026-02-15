import type { IoUnsubscribe } from './types.js';

type Dependency = {
  subscribe: (fn: (...args: unknown[]) => void) => IoUnsubscribe;
};

type TrackingContext = {
  recordDependency: (dep: Dependency) => void;
};

let activeContext: TrackingContext | null = null;

export function trackRead(dep: Dependency): void {
  activeContext?.recordDependency(dep);
}

function withTracking<R>(ctx: TrackingContext, fn: () => R): R {
  const prev = activeContext;
  activeContext = ctx;
  try {
    return fn();
  } finally {
    activeContext = prev;
  }
}

type DepEntry = {
  dep: Dependency;
  unsub: IoUnsubscribe;
};

class DependencySet {
  private deps = new Map<Dependency, DepEntry>();

  beginCollect(): Set<Dependency> {
    return new Set<Dependency>();
  }

  endCollect(newDeps: Set<Dependency>, onDepChanged: () => void): void {
    this.deps.forEach((entry, dep) => {
      if (newDeps.has(dep)) return;
      entry.unsub();
      this.deps.delete(dep);
    });
    for (const dep of newDeps) {
      if (this.deps.has(dep)) continue;
      const unsub = dep.subscribe(onDepChanged);
      this.deps.set(dep, { dep, unsub });
    }
  }

  dispose(): void {
    for (const entry of this.deps.values()) entry.unsub();
    this.deps.clear();
  }
}

let effectFlushQueued = false;
let scheduledEffects = new Set<EffectImpl>();
let flushingEffects = new Set<EffectImpl>();

function scheduleEffectRun(effect: EffectImpl): void {
  if (effect.scheduled) return;
  effect.scheduled = true;
  scheduledEffects.add(effect);
  if (effectFlushQueued) return;
  effectFlushQueued = true;
  queueMicrotask(() => {
    effectFlushQueued = false;
    const executing = scheduledEffects;
    scheduledEffects = flushingEffects;
    flushingEffects = executing;
    scheduledEffects.clear();
    executing.forEach((e) => {
      e.scheduled = false;
      if (!e.disposed) e.run();
    });
    executing.clear();
  });
}

class EffectImpl implements TrackingContext {
  private deps = new DependencySet();
  private cleanup: (() => void) | undefined;
  disposed = false;
  scheduled = false;

  constructor(private fn: () => void | (() => void)) {}

  recordDependency(dep: Dependency): void {
    this.currentDeps?.add(dep);
  }

  private currentDeps: Set<Dependency> | null = null;

  run(): void {
    if (this.disposed) return;
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }
    const nextDeps = this.deps.beginCollect();
    this.currentDeps = nextDeps;
    const result = withTracking(this, () => this.fn());
    this.currentDeps = null;
    if (typeof result === 'function') this.cleanup = result;
    this.deps.endCollect(nextDeps, () => scheduleEffectRun(this));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }
    this.deps.dispose();
  }
}

export function effect(fn: () => void | (() => void)): IoUnsubscribe {
  const e = new EffectImpl(fn);
  e.run();
  return () => e.dispose();
}

export class SignalState<T> implements Dependency {
  private value: T;
  private listeners = new Set<() => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    trackRead(this);
    return this.value;
  }

  set(next: T | ((prev: T) => T)): void {
    const prev = this.value;
    const resolved =
      typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    if (Object.is(prev, resolved)) return;
    this.value = resolved;
    for (const listener of this.listeners) listener();
  }

  subscribe(fn: () => void): IoUnsubscribe {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export class SignalComputed<T> implements Dependency, TrackingContext {
  private deps = new DependencySet();
  private listeners = new Set<() => void>();
  private cached: T | undefined;
  private dirty = true;
  private collecting: Set<Dependency> | null = null;

  constructor(private compute: () => T) {}

  private onDependencyChanged = (): void => {
    if (!this.dirty) {
      this.dirty = true;
      for (const listener of this.listeners) listener();
    }
  };

  private recompute(): void {
    const nextDeps = this.deps.beginCollect();
    this.collecting = nextDeps;
    const next = withTracking(this, () => this.compute());
    this.collecting = null;
    this.deps.endCollect(nextDeps, this.onDependencyChanged);
    this.cached = next;
    this.dirty = false;
  }

  recordDependency(dep: Dependency): void {
    this.collecting?.add(dep);
  }

  get(): T {
    trackRead(this);
    if (this.dirty) this.recompute();
    return this.cached as T;
  }

  subscribe(fn: () => void): IoUnsubscribe {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const Signal = {
  State: SignalState,
  Computed: SignalComputed,
};

export function state<T>(initial: T): SignalState<T> {
  return new SignalState(initial);
}

export function computed<T>(fn: () => T): SignalComputed<T> {
  return new SignalComputed(fn);
}
