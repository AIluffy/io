# OIN Documentation

This is the documentation site for OIN, built with [Starlight](https://starlight.astro.build/).

## Project Structure

- `src/content/docs/`: Markdown/MDX documentation files.
- `src/components/`: Custom Astro/React components.
- `src/styles/`: Custom CSS.
- `astro.config.mjs`: Starlight configuration.

## Commands

All commands are run from the root of the repo (using `-w apps/docs`) or inside `apps/docs`.

| Command                   | Description                                 |
| ------------------------- | ------------------------------------------- |
| `npm run dev -w apps/docs`| Start local development server              |
| `npm run build -w apps/docs`| Build for production                        |
| `npm run preview -w apps/docs`| Preview the production build                |

## Adding Content

1.  Add new `.md` or `.mdx` files in `src/content/docs/en/` and `src/content/docs/zh-cn/`.
2.  Update `sidebar` in `astro.config.mjs` if not using autogenerate (we use a mix).

## Deployment

Deployed automatically to GitHub Pages via GitHub Actions on push to `main`.
