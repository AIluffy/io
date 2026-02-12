import type { TreeContext } from './io-tree-types.js';

import { createTrieNode } from './path-trie.js';

export type IoTreeOptions = {
  devtools?: boolean;
  maxDepth?: number;
};

export function createTreeContext(options?: IoTreeOptions): TreeContext {
  return {
    root: createTrieNode(),
    errorListeners: new Set(),
    devtools: resolveDevtoolsEnabled(options),
    maxDepth: options?.maxDepth,
    seen: new WeakMap(),
  };
}

function resolveDevtoolsEnabled(options?: Pick<IoTreeOptions, 'devtools'>): boolean {
  if (options?.devtools === true) return true;
  if (options?.devtools === false) return false;
  const flag = (globalThis as Record<PropertyKey, unknown>).__IO_DEVTOOLS__;
  if (flag === false) return false;
  return isDevEnv();
}

function isDevEnv(): boolean {
  if (typeof process !== 'undefined') {
    const env = (
      process as unknown as { env?: Record<string, string | undefined> }
    ).env;
    if (env?.NODE_ENV) return env.NODE_ENV !== 'production';
  }
  return true;
}
