---
title: Getting Started
description: How to install and use OIN.
sidebar:
  order: 2
---

import { Steps, FileTree } from '@astrojs/starlight/components';

## Installation

<Steps>

1.  Install the core package:

    ```bash
    npm install @org/oin
    ```

2.  Install your framework adapter (optional):

    ```bash
    npm install @org/oin-react
    ```

</Steps>

## Project Structure

<FileTree>
- src
  - components
  - store
    - index.ts
  - App.tsx
</FileTree>

## First State

```ts
import { oin } from '@org/oin';

const count = oin(0);

count();          // read
count(1);         // write
count((v) => v + 1);
```

## Deep Tree Mode

`oin()` creates a shallow scope for objects (only the first level becomes units). Use `oinTree()` / `oinDeep()` when you want nested properties to be units as well.

```ts
import { oinDeep } from '@org/oin';

const user = oinDeep({ profile: { name: 'Ada' } });

user.profile.name();        // "Ada"
user.profile.name('Grace'); // write at path ["profile","name"]
```

## Next Steps

- Browse the full API reference under Reference in the sidebar.
