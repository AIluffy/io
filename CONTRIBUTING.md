# Contributing

## Prerequisites

- Node.js 20+
- npm

## Local Development

- Install dependencies: `npm ci`
- Run checks: `npm exec nx run-many -t lint test typecheck build`
- Run affected checks: `npm exec nx affected -t lint test typecheck build`
- Run store perf budget: `npm exec nx run @iostore/store:perf-budget`
- Run store bundle size + tree-shaking check: `npm exec nx run @iostore/store:bundle-size`

## Testing

- Run all tests: `npm exec nx run-many -t test`
- Run a single project: `npm exec nx run <project>:test`
- Run with coverage: `npm exec nx run-many -t test -- --coverage`

## Coding Standards

- Keep changes scoped and add tests for behavioral changes.
- Prefer `nx` targets over direct tool commands.
- Use TypeScript strict-safe patterns (`unknown` over `any`, explicit exported return types).

## Pull Requests

- Use clear commit messages.
- Include tests and update docs when behavior changes.
- Ensure CI passes before requesting review.

## Releases & Changelog

- Workspace releases use Nx Release.
- `CHANGELOG.md` is generated/updated by release automation (`nx release ...` in CI).
- Release governance docs:
  - `.github/release-checklist.md`
  - `.github/regression-matrix.md`
  - `.github/incident-severity-response.md`

## Bundle Size Budgets

- The `@iostore/store:bundle-size` target validates `raw`, `gzip`, and `brotli` bundle budgets and a tree-shaking savings threshold.
- Baseline file: `packages/io/scripts/bundle-size-baseline.json`.
- You can override behavior with env vars:
  - `IO_SIZE_BASELINE_PATH` (custom baseline file path)
  - `IO_SIZE_MAX_REGRESS_PCT` (override baseline/default regression budget)
  - `IO_TREE_SHAKING_MIN_SAVINGS_RATIO` (default `0.15`)
