// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import oinAccessPlugin from '../../tools/oin-babel-plugin/index.mjs';
import { babel } from '@rollup/plugin-babel';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  vite: {
    resolve: {
      conditions: ['@org/source'],
    },
    plugins: [
      babel({
        babelHelpers: 'bundled',
        extensions: ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'],
        plugins: [oinAccessPlugin],
      }),
    ],
  },
  integrations: [
    react(),
    starlight({
      title: 'OIN Documentation',
      defaultLocale: 'en',
      locales: {
        en: {
          label: 'English',
        },
        'zh-cn': {
          label: '简体中文',
          lang: 'zh-CN',
        },
      },
      sidebar: [
        {
          label: 'Guides',
          translations: { 'zh-cn': '指南' },
          items: [
            { label: 'Introduction', slug: 'intro' },
            { label: 'Getting Started', slug: 'getting-started' },
            { label: 'Architecture', slug: 'architecture' },
            { label: 'Examples', slug: 'examples' },
            { label: 'Extensions', slug: 'extensions' },
            { label: 'Playground', slug: 'playground' },
            { label: 'DevTools', slug: 'devtools' },
            { label: 'Maintenance', slug: 'maintenance' },
          ],
        },
        {
          label: 'Reference',
          translations: { 'zh-cn': '参考' },
          autogenerate: { directory: 'reference' },
        },
      ],
      customCss: ['./src/styles/custom.css'],
      components: {
        Head: './src/components/Head.astro',
        Footer: './src/components/Footer.astro',
        SiteTitle: './src/components/SiteTitle.astro',
      },
      // Pagefind is enabled by default
    }),
  ],
});
