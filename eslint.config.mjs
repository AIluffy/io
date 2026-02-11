import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/dist-types',
      '**/build',
      '**/.astro/**',
      '**/vite.config.*',
      '**/vitest.config.*',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(.base)?.config.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: 'scope:io',
              onlyDependOnLibsWithTags: ['scope:io'],
            },
            {
              sourceTag: 'scope:io-devtools',
              onlyDependOnLibsWithTags: ['scope:io', 'scope:io-devtools'],
            },
            {
              sourceTag: 'scope:io-react',
              onlyDependOnLibsWithTags: ['scope:io', 'scope:io-react'],
            },
            {
              sourceTag: 'scope:io-devtools-react',
              onlyDependOnLibsWithTags: [
                'scope:io',
                'scope:io-devtools',
                'scope:io-devtools-react',
              ],
            },
            {
              sourceTag: 'scope:io-svelte',
              onlyDependOnLibsWithTags: ['scope:io', 'scope:io-svelte'],
            },
            {
              sourceTag: 'scope:io-vue',
              onlyDependOnLibsWithTags: ['scope:io', 'scope:io-vue'],
            },
            {
              sourceTag: 'scope:io-example',
              onlyDependOnLibsWithTags: [
                'scope:io',
                'scope:io-react',
                'scope:io-svelte',
                'scope:io-vue',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
