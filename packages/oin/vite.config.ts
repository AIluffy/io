import { babel } from '@rollup/plugin-babel';
import { defineConfig } from 'vite';

// @ts-ignore
import oinAccessPlugin from '../../tools/oin-babel-plugin/index.mjs';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/oin',
  plugins: [
    babel({
      babelHelpers: 'bundled',
      extensions: ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'],
      plugins: [oinAccessPlugin],
    }),
  ],
  test: {
    name: '@org/oin',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
