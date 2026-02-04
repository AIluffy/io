// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import starlightThemeSix from '@six-tech/starlight-theme-six';
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
      plugins: [
        // starlightThemeSix({
        //   navLinks: [
        //     {
        //       label: { en: 'Getting Started', 'zh-cn': '入门' },
        //       link: '/getting-started/introduction/',
        //     },
        //     {
        //       label: { en: 'Core Concepts', 'zh-cn': '核心概念' },
        //       link: '/core-concepts/units-scopes/',
        //     },
        //     {
        //       label: { en: 'Guides', 'zh-cn': '指南' },
        //       link: '/guides/derived/',
        //     },
        //     {
        //       label: { en: 'Behaviors', 'zh-cn': '行为扩展' },
        //       link: '/behaviors/overview/',
        //     },
        //     {
        //       label: { en: 'Integrations', 'zh-cn': '集成' },
        //       link: '/integrations/vanilla/',
        //     },
        //     {
        //       label: { en: 'Migrations', 'zh-cn': '迁移' },
        //       link: '/migrations/from-zustand/',
        //     },
        //     {
        //       label: { en: 'Reference', 'zh-cn': '参考' },
        //       link: '/reference/',
        //     },
        //     {
        //       label: { en: 'Maintenance', 'zh-cn': '维护' },
        //       link: '/maintenance/',
        //     },
        //   ],
        //   footerText:
        //     'OIN — Reactive state primitives with deep signal support. Built with Astro Starlight.',
        // }),
      ],
      title: 'OIN Documentation',
      description: 'Reactive state management with deep signal support.',
      logo: {
        light: './src/assets/oin-logo-light.svg',
        dark: './src/assets/oin-logo-dark.svg',
        alt: 'OIN',
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
