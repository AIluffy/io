import { defineConfig } from 'vite';
import { STORE_COVERAGE_THRESHOLDS } from './vitest.coverage.js';

// @ts-ignore

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/io',
  test: {
    name: '@iostore/store',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: STORE_COVERAGE_THRESHOLDS,
    },
  },
}));
