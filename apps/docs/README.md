# IO Documentation Site

IO docs are built with [Starlight](https://starlight.astro.build/) in the `apps/docs` project.

## Content Layout

- `src/content/docs/`: default locale content (Simplified Chinese).
- `src/content/docs/en/`: English content.
- `src/content/docs/{,en}/api-reference/`: generated API reference pages.
- `src/components/`: custom Astro/React components used by docs pages.
- `src/styles/`: docs-specific styles.
- `astro.config.mjs`: site and sidebar configuration.

## Commands (run from workspace root)

Use Nx through `npm exec nx -- ...`.

| Command | Description |
| --- | --- |
| `npm exec nx -- run apps-docs:dev` | Start local dev server |
| `npm exec nx -- run apps-docs:build` | Build production site |
| `npm exec nx -- run apps-docs:preview` | Preview production build |
| `npm exec nx -- run apps-docs:generate-api` | Regenerate API docs from package exports |

## Authoring Workflow

1. Edit content under `src/content/docs/` (and `src/content/docs/en/` when needed).
2. If public APIs changed, regenerate API pages with `apps-docs:generate-api`.
3. Run `apps-docs:build` locally before opening a PR.
4. Keep internal links locale-aware:
   - default locale uses `/...`
   - English locale uses `/en/...`

## Deployment

- CI entrypoint: `.github/workflows/deploy-docs.yml`
- Target: Vercel production deployment via GitHub Actions
- Required secrets:
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
