# io-devtools-react

IO DevTools 的 React 组件包。

## Exports

- `IoDevtoolsPanel`
- `IoDevtoolsErrorBoundary`

## Usage

```tsx
import { createIoDevtools } from 'io-devtools';
import { io } from 'io-store';
import { IoDevtoolsPanel } from 'io-devtools-react';

const count = io(0);
const devtools = createIoDevtools(count, { name: 'counter' });

export function App() {
  return <IoDevtoolsPanel devtools={devtools} />;
}
```
