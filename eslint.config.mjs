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
              sourceTag: 'scope:oin',
              onlyDependOnLibsWithTags: ['scope:oin'],
            },
            {
              sourceTag: 'scope:oin-devtools',
              onlyDependOnLibsWithTags: ['scope:oin', 'scope:oin-devtools'],
            },
            {
              sourceTag: 'scope:oin-react',
              onlyDependOnLibsWithTags: ['scope:oin', 'scope:oin-react'],
            },
            {
              sourceTag: 'scope:oin-devtools-react',
              onlyDependOnLibsWithTags: [
                'scope:oin',
                'scope:oin-devtools',
                'scope:oin-devtools-react',
              ],
            },
            {
              sourceTag: 'scope:oin-svelte',
              onlyDependOnLibsWithTags: ['scope:oin', 'scope:oin-svelte'],
            },
            {
              sourceTag: 'scope:oin-vue',
              onlyDependOnLibsWithTags: ['scope:oin', 'scope:oin-vue'],
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
