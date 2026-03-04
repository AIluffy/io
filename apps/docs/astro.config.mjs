// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import vue from '@astrojs/vue';
import rehypeSortable from './src/rehype/rehype-sortable.js';
import liveCode from 'astro-live-code';
import mermaid from 'astro-mermaid';
import starlightSidebarTopics from 'starlight-sidebar-topics';

const docsSite = process.env.DOCS_SITE_URL ?? 'https://docs.iostore.dev';

const sidebarTopics = [
  {
    id: 'docs',
    label: { 'zh-CN': '核心文档', en: 'Core Docs' },
    link: '/start-here/quick-start/',
    items: [
      {
        label: 'Getting Started',
        translations: { 'zh-CN': '入门指南' },
        collapsed: false,
        autogenerate: { directory: 'start-here' },
      },
      {
        label: 'Core Concepts',
        translations: { 'zh-CN': '核心概念' },
        collapsed: false,
        autogenerate: { directory: 'fundamentals' },
      },
      {
        label: 'Practical Guides',
        translations: { 'zh-CN': '实战指南' },
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
        label: 'Framework Integration',
        translations: { 'zh-CN': '框架集成' },
        collapsed: true,
        autogenerate: { directory: 'frameworks' },
      },
      {
        label: 'Migration & Upgrade',
        translations: { 'zh-CN': '迁移与升级' },
        collapsed: true,
        autogenerate: { directory: 'migration' },
      },
    ],
  },
  {
    id: 'query',
    label: { 'zh-CN': 'Query 工程', en: 'Query Engineering' },
    link: '/cookbook/async-query/',
    items: [
      {
        label: 'Query Architecture',
        translations: { 'zh-CN': '查询架构' },
        collapsed: false,
        items: [
          { slug: 'cookbook/async-query' },
          { slug: 'cookbook/async-query/tutorial-async-todo-list' },
          { slug: 'cookbook/async-query/playground' },
          { slug: 'cookbook/async-query/architecture-and-state-machine' },
          { slug: 'cookbook/async-query/vanilla-query-client-and-lifecycle' },
          { slug: 'cookbook/async-query/useio-and-common-capabilities' },
          { slug: 'cookbook/async-query/query-keys-cache-and-refetch' },
          {
            slug: 'cookbook/async-query/mutation-optimistic-update-and-invalidation',
          },
          { slug: 'cookbook/async-query/pagination-prefetch-and-cancellation' },
          { slug: 'cookbook/async-query/infinite-query' },
          { slug: 'cookbook/async-query/ssr-cache-seeding-strategy' },
        ],
      },
      {
        label: 'Adapter Integrations',
        translations: { 'zh-CN': '适配器集成' },
        collapsed: false,
        items: [
          { slug: 'cookbook/async-query/react-adapter' },
          { slug: 'cookbook/async-query/vue-adapter' },
          { slug: 'cookbook/async-query/svelte-adapter' },
          { slug: 'cookbook/async-query/solid-adapter' },
          { slug: 'cookbook/async-query/lynx-adapter' },
          { slug: 'cookbook/async-query/next-adapter' },
          { slug: 'cookbook/async-query/nuxt-adapter' },
          { slug: 'cookbook/async-query/sveltekit-adapter' },
        ],
      },
    ],
  },
  {
    id: 'api',
    label: { 'zh-CN': '接口参考', en: 'API Reference' },
    link: '/api-reference/',
    items: [
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
              {
                label: 'React',
                autogenerate: { directory: 'api-reference/io-react' },
              },
              {
                label: 'Vue',
                autogenerate: { directory: 'api-reference/io-vue' },
              },
              {
                label: 'Svelte',
                autogenerate: { directory: 'api-reference/io-svelte' },
              },
              {
                label: 'Solid',
                autogenerate: { directory: 'api-reference/io-solid' },
              },
              {
                label: 'Lynx',
                autogenerate: { directory: 'api-reference/io-lynx' },
              },
            ],
          },
          {
            label: 'DevTools',
            items: [
              {
                label: '@iostore/devtools',
                autogenerate: { directory: 'api-reference/io-devtools' },
              },
              {
                label: '@iostore/devtools-react',
                autogenerate: { directory: 'api-reference/io-devtools-react' },
              },
            ],
          },
          { slug: 'api-reference/versions' },
        ],
      },
    ],
  },
];

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
      plugins: [
        starlightSidebarTopics(sidebarTopics, {
          topics: {
            query: ['/cookbook/async-query/**', '/en/cookbook/async-query/**'],
            api: [
              '/api-reference/**',
              '/en/api-reference/**',
            ],
            docs: [
              '/',
              '/en/',
              '/start-here/**',
              '/en/start-here/**',
              '/fundamentals/**',
              '/en/fundamentals/**',
              '/frameworks/**',
              '/en/frameworks/**',
              '/guides/**',
              '/en/guides/**',
              '/migration/**',
              '/en/migration/**',
              '/cookbook/**',
              '/en/cookbook/**',
            ],
          },
        }),
      ],
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
      customCss: ['./src/styles/custom.css'],
      components: {
        Head: './src/components/Head.astro',
        Hero: './src/components/Hero.astro',
        Sidebar: './src/components/Sidebar.astro',
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/AIluffy/io',
        },
      ],
      // Pagefind is enabled by default
    }),
  ],
});
