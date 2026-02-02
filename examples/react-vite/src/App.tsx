import { oin } from '@oin/store';
import { useOin } from '@oin/react';

const count = oin(0);

export function App() {
  const value = useOin(count);

  return (
    <div style={{ fontFamily: 'system-ui', padding: 16 }}>
      <h1>OIN + React</h1>
      <button onClick={() => count((v) => v + 1)} style={{ fontSize: 16, padding: '8px 12px' }}>
        Count: {value}
      </button>
    </div>
  );
}
