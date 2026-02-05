# IO Documentation

This is the documentation site for IO, built with [Starlight](https://starlight.astro.build/).

## Project Structure

- `src/content/docs/{lang}/`: Content files (e.g., `en/`, `zh-cn/`).
- `src/components/`: Custom Astro/React components.
- `src/styles/`: Custom CSS.
- `astro.config.mjs`: Starlight configuration.

## Commands

All commands are run using Nx from the root of the repo.

| Command                   | Description                                 |
| ------------------------- | ------------------------------------------- |
| `nx run apps-docs:dev`    | Start local development server              |
| `nx run apps-docs:build`  | Build for production                        |
| `nx run apps-docs:preview`| Preview the production build                |

## Adding Content

1.  Add new `.md` or `.mdx` files in `src/content/docs/en/` and `src/content/docs/zh-cn/`.
2.  Update `sidebar` in `astro.config.mjs` if not using autogenerate (we use a mix).

## Deployment

Deployed automatically to GitHub Pages via GitHub Actions on push to `main`.
