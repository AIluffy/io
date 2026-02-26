export class SwapBuffer<K, V> {
  private pending = new Map<K, V>();
  private flushing = new Map<K, V>();

  get size(): number {
    return this.pending.size;
  }

  get(key: K): V | undefined {
    return this.pending.get(key);
  }

  set(key: K, value: V): void {
    this.pending.set(key, value);
  }

  drain(run: (executing: Map<K, V>) => void): void {
    if (this.pending.size === 0) return;
    const executing = this.pending;
    this.pending = this.flushing;
    this.flushing = executing;
    this.pending.clear();
    run(executing);
    executing.clear();
  }
}
