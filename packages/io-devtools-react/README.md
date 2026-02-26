# @iostore/devtools-react

IO DevTools 的 React 组件包。

## Exports

- `IoDevtoolsPanel`
- `IoDevtoolsErrorBoundary`

## Usage

```tsx
import { createIoDevtools } from '@iostore/devtools';
import { io } from '@iostore/store';
import { IoDevtoolsPanel } from '@iostore/devtools-react';
import '@iostore/devtools-react/styles.css';

const count = io(0);
const devtools = createIoDevtools(count, { name: 'counter' });

export function App() {
  return <IoDevtoolsPanel devtools={devtools} />;
}
```
