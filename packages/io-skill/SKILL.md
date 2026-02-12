---
name: io-skill
description: Usage guide for IO packages. Use when an agent needs to explain or implement app-level usage of io-store, io-react, io-vue, io-svelte, and io-devtools (including state modeling, subscriptions, batching, framework adapters, SSR-safe usage, and debugging integration).
---

# IO Package Usage Skill

Use this skill to guide consumers of IO packages, not monorepo contributors.

## Packages And Roles

- `io-store`: core state primitives and utilities.
  - Main exports: `io`, `derived`, `batch`, `applyUpdate`, `replay`, `undoUpdate`, `mergeUpdates`, `createHistory`, `onError`, `onMutation`, `link`.
- `io-react`: React adapter.
  - Main export: `useIO`.
- `io-vue`: Vue adapter.
  - Main exports: `useIO`, `ioRef`.
- `io-svelte`: Svelte adapter.
  - Main exports: `toReadable`, `toWritable`.
- `io-devtools`: runtime devtools engine and diff helpers.
- `io-devtools-react`: React UI components for devtools panel.

## Core Usage Patterns (`io-store`)

### 1) Create state

```ts
import { io } from 'io-store';

const count = io(0);
const user = io({ name: 'Ada', age: 20 });
const items = io([{ id: 1, done: false }]);
```

### 2) Read/write

```ts
count.get();
count.set(1);
count.set((v) => v + 1);

user.name.set('Grace');
items[0].done.set(true);
```

### 3) Subscribe and cleanup

```ts
const unsub = user.subscribe((snapshot) => {
  console.log(snapshot);
});
// ...
unsub();
```

### 4) Derived values and batching

```ts
import { derived, batch } from 'io-store';

const total = derived([count], (c) => c * 2);

batch(() => {
  count.set(2);
  user.age.set((v) => v + 1);
});
```

### 5) Commit/update history

```ts
import { createHistory, applyUpdate, undoUpdate } from 'io-store';

const history = createHistory(user);
// user mutations...
history.undo();
history.redo();

// patch replay
applyUpdate(user, someUpdate);
applyUpdate(user, undoUpdate(someUpdate));
```

## Framework Adapters

### React (`io-react`)

```tsx
import { useIO } from 'io-react';
import type { IoUnit } from 'io-store';

function Counter({ count }: { count: IoUnit<number> }) {
  const value = useIO(count, { schedule: 'microtask' });
  return <button onClick={() => count.set((v) => v + 1)}>{value}</button>;
}
```

Notes:
- `useIO` is SSR-safe; in server env it avoids client subscriptions.

### Vue (`io-vue`)

```ts
import { useIO, ioRef } from 'io-vue';

const state = useIO(user, { schedule: 'microtask' });
const age = ioRef(user.age);
```

### Svelte (`io-svelte`)

```ts
import { toReadable, toWritable } from 'io-svelte';

const userStore = toReadable(user);
const ageStore = toWritable(user.age, { schedule: 'sync' });
```

Svelte 5:
- `toReadable`/`toWritable` are compatible with runes helpers like `fromStore`.

## Behaviors

From `io-store/behavior`:
- `withBehaviors`
- `schedule`
- `persist`
- `devtools`

Example:

```ts
import { io } from 'io-store';
import { withBehaviors, persist, schedule } from 'io-store/behavior';

const count = io(0);
const view = withBehaviors(count, [
  schedule('microtask'),
  persist({ key: 'count' }),
]);
```

## Devtools

Engine:

```ts
import { createIoDevtools } from 'io-devtools';

const devtools = createIoDevtools({ target: user });
```

React panel:

```tsx
import { IoDevtoolsPanel } from 'io-devtools-react';
```

## Guidance Rules For Agents

- Prefer minimal examples that directly match user stack (React/Vue/Svelte/vanilla).
- Always include unsubscribe/cleanup in examples with subscriptions.
- For persistence examples, include error handling callback via `persist({ onError })`.
- For SSR questions, explicitly mention behavior in server env and avoid DOM assumptions.
- Do not mix monorepo contributor workflow with end-user package usage unless user asks.
