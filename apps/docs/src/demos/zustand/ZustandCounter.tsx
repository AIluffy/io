import React from 'react';
import { create } from 'zustand';

type CounterStore = {
  count: number;
  inc: () => void;
};

const useCounterStore = create<CounterStore>((set) => ({
  count: 0,
  // 通过订阅触发视图更新，避免引入额外 action 结构。
  inc: () => set((s) => ({ count: s.count + 1 })),
}));

export default function ZustandCounter() {
  const count = useCounterStore((s) => s.count);
  const inc = useCounterStore((s) => s.inc);

  return (
    <button type="button" onClick={inc}>
      count: {count}
    </button>
  );
}
