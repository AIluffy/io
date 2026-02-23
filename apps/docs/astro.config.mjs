// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import vue from '@astrojs/vue';
import rehypeSortable from './src/rehype/rehype-sortable.js';
import liveCode from 'astro-live-code';
import mermaid from 'astro-mermaid';

const docsSite = process.env.DOCS_SITE_URL ?? 'https://docs.iostore.dev';

// https://astro.build/config
export default defineConfig({
  site: docsSite,
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
    liveCode({
      defaultProps: {
        theme: 'dark',
      },
    }),
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
      defaultLocale: 'root',
      locales: {
        root: {
          label: '简体中文',
          lang: 'zh-CN',
        },
        en: {
          label: 'English',
        },
      },
      sidebar: [
        {
          label: 'Start Here',
          translations: { 'zh-CN': '快速上手' },
          collapsed: false,
          autogenerate: { directory: 'start-here' },
        },
        {
          label: 'Fundamentals',
          translations: { 'zh-CN': '核心原理' },
          collapsed: false,
          autogenerate: { directory: 'fundamentals' },
        },
        {
          label: 'Cookbook',
          translations: { 'zh-CN': '实践配方' },
          collapsed: false,
          items: [
            {
              label: 'State Patterns',
              translations: { 'zh-CN': '状态模式' },
              items: [
                { slug: 'cookbook/derived' },
                { slug: 'cookbook/composition' },
                { slug: 'cookbook/batching' },
                { slug: 'cookbook/subscriptions' },
                { slug: 'cookbook/performance-subscription' },
              ],
            },
            {
              label: 'Runtime Behaviors',
              translations: { 'zh-CN': '运行时行为' },
              items: [
                { slug: 'cookbook/overview' },
                { slug: 'cookbook/persist' },
                { slug: 'cookbook/schedule' },
                { slug: 'cookbook/throttle' },
                { slug: 'cookbook/debounce' },
                { slug: 'cookbook/effect' },
                { slug: 'cookbook/devtools' },
              ],
            },
            {
              label: 'Engineering',
              translations: { 'zh-CN': '工程实践' },
              items: [
                { slug: 'cookbook/testing' },
                { slug: 'cookbook/typescript' },
                { slug: 'cookbook/benchmark' },
              ],
            },
          ],
        },
        {
          label: 'Frameworks',
          translations: { 'zh-CN': '框架集成' },
          collapsed: true,
          autogenerate: { directory: 'frameworks' },
        },
        {
          label: 'Migration',
          translations: { 'zh-CN': '迁移指南' },
          collapsed: true,
          autogenerate: { directory: 'migration' },
        },
        {
          label: 'API Reference',
          translations: { 'zh-CN': 'API 参考' },
          collapsed: true,
          items: [
            {
              label: 'Core IO',
              autogenerate: { directory: 'api-reference/io' },
            },
            {
              label: 'Query',
              autogenerate: { directory: 'api-reference/io-query' },
            },
            {
              label: 'Adapters',
              translations: { 'zh-CN': '适配器' },
              items: [
                { label: 'React', autogenerate: { directory: 'api-reference/io-react' } },
                { label: 'Vue', autogenerate: { directory: 'api-reference/io-vue' } },
                { label: 'Svelte', autogenerate: { directory: 'api-reference/io-svelte' } },
                { label: 'Solid', autogenerate: { directory: 'api-reference/io-solid' } },
                { label: 'Lynx', autogenerate: { directory: 'api-reference/io-lynx' } },
              ],
            },
            {
              label: 'DevTools',
              items: [
                { label: '@iostore/devtools', autogenerate: { directory: 'api-reference/io-devtools' } },
                { label: '@iostore/devtools-react', autogenerate: { directory: 'api-reference/io-devtools-react' } },
              ],
            },
            { slug: 'api-reference/versions' },
          ],
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
