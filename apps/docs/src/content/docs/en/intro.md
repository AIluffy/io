---
title: Introduction
description: What is OIN?
sidebar:
  order: 1
---

import { Tabs, TabItem } from '@astrojs/starlight/components';

**OIN** is a TypeScript state library built around a small set of primitives (Unit / Scope / ArrayUnit / Tree) and an explicit mutation log (Patch/Update). It supports derivations, batching, and framework adapters.

## Key Features

- **Composable primitives**: `oin()` creates Unit / Scope / ArrayUnit based on the initial value.
- **Deep tree mode**: `oinTree()` / `oinDeep()` build path-addressable deep nodes.
- **Derivations**: `formula()` (explicit deps) and `derive()` (selector-driven).
- **Batching**: `batch()` coalesces notifications and merges updates.
- **Adapters**: React/Vue/Svelte bindings follow the same `snapshot() + subscribe()` contract.

## Example

<Tabs>
  <TabItem label="Core">
    ```ts
    import { oin, batch } from '@org/oin';

    const count = oin(0);

    count();      // 0
    count(1);     // write
    count();      // 1

    batch(() => {
      count((v) => v + 1);
      count((v) => v + 1);
    });
    ```
  </TabItem>
  <TabItem label="React">
    ```tsx
    import { oin } from '@org/oin';
    import { useOin } from '@org/oin-react';

    const count = oin(0);

    export function Counter() {
      const value = useOin(count);
      return (
        <button onClick={() => count((v) => v + 1)}>
          {value}
        </button>
      );
    }
    ```
  </TabItem>
</Tabs>
