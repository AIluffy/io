---
name: io-skill
description: Usage guide for IO packages. Use when an agent needs to explain or implement app-level usage of @iostore/store, @iostore/react, @iostore/solid, @iostore/vue, @iostore/svelte, and @iostore/devtools (including state modeling, subscriptions, batching, framework adapters, SSR-safe usage, and debugging integration).
---

# IO Package Usage Skill

Use this skill to guide consumers of IO packages, not monorepo contributors.

## Packages And Roles

- `@iostore/store`: core state primitives and utilities.
  - Main exports: `io`, `derived`, `batch`, `applyUpdate`, `replay`, `undoUpdate`, `mergeUpdates`, `createHistory`, `onError`, `onMutation`, `link`.
- `@iostore/react`: React adapter.
  - Main export: `useIO`.
- `@iostore/solid`: Solid adapter.
  - Main export: `useIO`.
- `@iostore/vue`: Vue adapter.
  - Main exports: `useIO`, `ioRef`.
- `@iostore/svelte`: Svelte adapter.
  - Main exports: `toReadable`, `toWritable`.
- `@iostore/devtools`: runtime devtools engine and diff helpers.
- `@iostore/devtools-react`: React UI components for devtools panel.

## Core Usage Patterns (`@iostore/store`)

### 1) Create state

```ts
import { io } from '@iostore/store';

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
import { derived, batch } from '@iostore/store';

const total = derived([count], (c) => c * 2);

batch(() => {
  count.set(2);
  user.age.set((v) => v + 1);
});
```

### 5) Commit/update history

```ts
import { createHistory, applyUpdate, undoUpdate } from '@iostore/store';

const history = createHistory(user);
// user mutations...
history.undo();
history.redo();

// patch replay
applyUpdate(user, someUpdate);
applyUpdate(user, undoUpdate(someUpdate));
```

## Framework Adapters

### React (`@iostore/react`)

```tsx
import { useIO } from '@iostore/react';
import type { IoUnit } from '@iostore/store';

function Counter({ count }: { count: IoUnit<number> }) {
  const value = useIO(count, { schedule: 'microtask' });
  return <button onClick={() => count.set((v) => v + 1)}>{value}</button>;
}
```

Notes:

- `useIO` is SSR-safe; in server env it avoids client subscriptions.

### Solid (`@iostore/solid`)

```tsx
import { useIO } from '@iostore/solid';
import type { IoUnit } from '@iostore/store';

function Counter({ count }: { count: IoUnit<number> }) {
  const value = useIO(count, { schedule: 'microtask' });
  return <button onClick={() => count.set((v) => v + 1)}>{value()}</button>;
}
```

### Vue (`@iostore/vue`)

```ts
import { useIO, ioRef } from '@iostore/vue';

const state = useIO(user, { schedule: 'microtask' });
const age = ioRef(user.age);
```

### Svelte (`@iostore/svelte`)

```ts
import { toReadable, toWritable } from '@iostore/svelte';

const userStore = toReadable(user);
const ageStore = toWritable(user.age, { schedule: 'sync' });
```

Svelte 5:

- `toReadable`/`toWritable` are compatible with runes helpers like `fromStore`.

## Behaviors

From `@iostore/store/behavior`:

- `withBehaviors`
- `schedule`
- `persist`
- `devtools`

Example:

```ts
import { io } from '@iostore/store';
import { withBehaviors, persist, schedule } from '@iostore/store/behavior';

const count = io(0);
const view = withBehaviors(count, [
  schedule('microtask'),
  persist({ key: 'count' }),
]);
```

## Devtools

Engine:

```ts
import { createIoDevtools } from '@iostore/devtools';

const devtools = createIoDevtools({ target: user });
```

React panel:

```tsx
import { IoDevtoolsPanel } from '@iostore/devtools-react';
```

## Guidance Rules For Agents

- Prefer minimal examples that directly match user stack (React/Solid/Vue/Svelte/vanilla).
- Always include unsubscribe/cleanup in examples with subscriptions.
- For persistence examples, include error handling callback via `persist({ onError })`.
- For SSR questions, explicitly mention behavior in server env and avoid DOM assumptions.
- Do not mix monorepo contributor workflow with end-user package usage unless user asks.
