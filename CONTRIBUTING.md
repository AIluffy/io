# Contributing

## Prerequisites

- Node.js 20+
- npm

## Local Development

- Install dependencies: `npm ci`
- Run checks: `npm exec nx run-many -t lint test typecheck build`
- Run affected checks: `npm exec nx affected -t lint test typecheck build`

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
