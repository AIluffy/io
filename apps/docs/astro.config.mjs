// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  vite: {
    resolve: {
      conditions: ['@org/source'],
    },
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
        {
          label: 'Experimental',
          translations: { 'zh-cn': '实验特性' },
          items: [
            { label: 'Signal', slug: 'reference/oin/signal' },
            { label: 'state', slug: 'reference/oin/state' },
            { label: 'computed', slug: 'reference/oin/computed' },
            { label: 'effect', slug: 'reference/oin/effect' },
            { label: 'untrack', slug: 'reference/oin/untrack' },
          ],
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
