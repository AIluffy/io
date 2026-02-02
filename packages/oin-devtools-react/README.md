# @oin/devtools-react

OIN DevTools 的 React 组件包。

## Exports

- `OinDevtoolsPanel`
- `OinDevtoolsErrorBoundary`

## Usage

```tsx
import { createOinDevtools } from '@oin/devtools';
import { oin } from '@oin/store';
import { OinDevtoolsPanel } from '@oin/devtools-react';

const count = oin(0);
const devtools = createOinDevtools(count, { name: 'counter' });

export function App() {
  return <OinDevtoolsPanel devtools={devtools} />;
}
```
