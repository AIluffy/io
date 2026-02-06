import React from 'react';
import { RecoilRoot, atom, useRecoilState } from 'recoil';

const countAtom = atom<number>({
  key: 'demo/recoil/count',
  default: 0,
});

function CounterView() {
  const [count, setCount] = useRecoilState(countAtom);

  return (
    <button type="button" onClick={() => setCount((v: number) => v + 1)}>
      count: {count}
    </button>
  );
}

export default function RecoilCounter() {
  return (
    <RecoilRoot>
      {/* RecoilRoot 放在 island 内，避免 SSR 输出持有可变的全局状态。 */}
      <CounterView />
    </RecoilRoot>
  );
}
