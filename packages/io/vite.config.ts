import { defineConfig } from 'vite';

// @ts-ignore

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/io',
  test: {
    name: 'io-store',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 65,
        statements: 80,
        'src/lib/core/*.ts': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        'src/lib/core/node-factory/**/*.ts': {
          lines: 75,
          functions: 60,
          branches: 60,
          statements: 75,
        },
      },
    },
  },
}));
