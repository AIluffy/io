# Io

Fine-grained reactive state management for React, Lynx, Vue, Svelte, and Solid.

Language: English | [简体中文](./README.zh-CN.md)

## Features

- Fine-grained updates: only affected nodes are notified.
- Deep object and array operations with a consistent API.
- Update logs with replay and undo support.
- One state model shared across multiple frameworks.

## Install

```bash
npm i @iostore/store
```

Install adapters as needed:

```bash
npm i @iostore/react
npm i @iostore/lynx
npm i @iostore/vue
npm i @iostore/svelte
npm i @iostore/solid
```

## Quick Start

```ts
import { io } from '@iostore/store';
import { derived } from '@iostore/store/derived';

const state = io({ count: 0, items: [1, 2, 3] });
state.count.set((v) => v + 1);
state.items.push(4);

const doubled = derived([state.count], (count) => count * 2);
```

Replay and undo updates:

```ts
import { applyUpdate, replay, undoUpdate } from '@iostore/store/patches';

const updates = [];
state.subscribeUpdate((u) => updates.push(u));

replay(anotherState, updates);
applyUpdate(state, undoUpdate(updates[0]));
```

## Framework Integration

React:

```tsx
import { useIO } from '@iostore/react';
const value = useIO(countUnit);
```

Lynx:

```tsx
import { useIO } from '@iostore/lynx';
const value = useIO(countUnit);
```

Vue:

```ts
import { ioRef, useIO } from '@iostore/vue';
const stateRef = useIO(source);
const countRef = ioRef(countUnit);
```

Svelte:

```ts
import { toReadable, toWritable } from '@iostore/svelte';
const readable = toReadable(state);
const writable = toWritable(unit);
```

Solid:

```tsx
import { useIO } from '@iostore/solid';
const value = useIO(countUnit);
```

## Packages

- `@iostore/store`
- `@iostore/react`
- `@iostore/lynx`
- `@iostore/vue`
- `@iostore/svelte`
- `@iostore/solid`
- `@iostore/devtools`
- `@iostore/devtools-react`
- `@iostore/skill`

## Documentation

- Docs site (zh-CN): `apps/docs/src/content/docs`
- Docs site (en): `apps/docs/src/content/docs/en`

## License

MIT
