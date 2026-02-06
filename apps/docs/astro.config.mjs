// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import vue from '@astrojs/vue';
import rehypeSortable from './src/rehype/rehype-sortable.js';

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
    starlight({
      plugins: [],
      title: 'IO Documentation',
      description: 'Reactive state management with deep signal support.',
      logo: {
        light: './src/assets/io-logo-light.svg',
        dark: './src/assets/io-logo-dark.svg',
        alt: 'IO',
      },
      favicon: '/favicon.svg',
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
          label: 'Getting Started',
          translations: { 'zh-cn': '入门' },
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Core Concepts',
          translations: { 'zh-cn': '核心概念' },
          autogenerate: { directory: 'core-concepts' },
        },
        {
          label: 'Guides',
          translations: { 'zh-cn': '指南' },
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'Behaviors',
          translations: { 'zh-cn': '行为扩展' },
          autogenerate: { directory: 'behaviors' },
        },
        {
          label: 'Integrations',
          translations: { 'zh-cn': '集成' },
          autogenerate: { directory: 'integrations' },
        },
        {
          label: 'State Management',
          translations: { 'zh-cn': '状态管理' },
          autogenerate: { directory: 'state-management' },
        },
        {
          label: 'Migrations',
          translations: { 'zh-cn': '迁移' },
          autogenerate: { directory: 'migrations' },
        },
        {
          label: 'Reference',
          translations: { 'zh-cn': '参考' },
          autogenerate: { directory: 'reference' },
        },
        {
          label: 'Maintenance',
          translations: { 'zh-cn': '维护' },
          autogenerate: { directory: 'maintenance' },
        },
      ],
      customCss: ['./src/styles/custom.css'],
      components: {
        Head: './src/components/Head.astro',
      },
      // Pagefind is enabled by default
    }),
  ],
});
