// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import vue from '@astrojs/vue';
import rehypeSortable from './src/rehype/rehype-sortable.js';
import liveCode from 'astro-live-code';
import mermaid from 'astro-mermaid';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  markdown: {
    rehypePlugins: [rehypeSortable],
  },
  vite: {
    resolve: {
      conditions: ['io-source'],
    },
  },
  integrations: [
    react(),
    vue(),
    liveCode({}),
    mermaid(),
    starlight({
      plugins: [],
      title: 'IO',
      description: 'Reactive state management with deep signal support.',
      logo: {
        light: './src/assets/io-logo.png',
        dark: './src/assets/io-logo.png',
        alt: 'IO',
      },
      favicon: '/favicon.ico',
      defaultLocale: 'zh-cn',
      locales: {
        en: {
          label: 'English',
        },
        'zh-cn': {
          label: '简体中文',
          lang: 'zh-cn',
        },
      },
      sidebar: [
        {
          label: 'Getting Started',
          translations: { 'zh-CN': '入门' },
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Guide',
          translations: { 'zh-CN': '指南' },
          items: [
            {
              label: 'Essentials',
              translations: { 'zh-CN': '核心概念' },
              autogenerate: { directory: 'core-concepts' },
            },
            {
              label: 'Advanced',
              translations: { 'zh-CN': '进阶指南' },
              autogenerate: { directory: 'guides' },
            },
            {
              label: 'Behaviors',
              translations: { 'zh-CN': '行为扩展' },
              autogenerate: { directory: 'behaviors' },
            },
          ],
        },
        {
          label: 'Integrations',
          translations: { 'zh-CN': '集成' },
          autogenerate: { directory: 'integrations' },
        },
        {
          label: 'Migrations',
          translations: { 'zh-CN': '迁移' },
          autogenerate: { directory: 'migrations' },
        },
        {
          label: 'Reference',
          translations: { 'zh-CN': '参考' },
          autogenerate: { directory: 'reference' },
        },
      ],
      customCss: ['./src/styles/custom.css'],
      components: {
        Head: './src/components/Head.astro',
        Hero: './src/components/Hero.astro',
      },
      // Pagefind is enabled by default
    }),
  ],
});
