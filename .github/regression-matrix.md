# Regression Matrix

This matrix defines release regression coverage by priority.

## Priority Definition

- `P0` Required for release.
- `P1` Required for minor/major release or broad refactor.
- `P2` Spot-check, run when touching that subsystem.

## Matrix

| Priority | Area | Project(s) | Command |
| --- | --- | --- | --- |
| P0 | Core store | `@iostore/store` | `npm exec nx -- run @iostore/store:test` |
| P0 | Core build | `@iostore/store` | `npm exec nx -- run @iostore/store:build` |
| P0 | React adapter | `@iostore/react` | `npm exec nx -- run @iostore/react:test` |
| P0 | Vue adapter | `@iostore/vue` | `npm exec nx -- run @iostore/vue:test` |
| P0 | Svelte adapter | `@iostore/svelte` | `npm exec nx -- run @iostore/svelte:test` |
| P0 | Solid adapter | `@iostore/solid` | `npm exec nx -- run @iostore/solid:test` |
| P0 | Lynx adapter | `@iostore/lynx` | `npm exec nx -- run @iostore/lynx:test` |
| P0 | Docs build | `apps-docs` | `npm exec nx -- run apps-docs:build` |
| P1 | Query runtime | `@iostore/query` | `npm exec nx -- run @iostore/query:test` |
| P1 | Devtools runtime | `@iostore/devtools` | `npm exec nx -- run @iostore/devtools:test` |
| P1 | Devtools React | `@iostore/devtools-react` | `npm exec nx -- run @iostore/devtools-react:test` |
| P1 | Perf budget | `@iostore/store` | `npm exec nx -- run @iostore/store:perf-budget` |
| P1 | Bundle budget | `@iostore/store` | `npm exec nx -- run @iostore/store:bundle-size` |
| P2 | Examples smoke | `io-example-*` | `npm exec nx -- run-many -t build --projects=io-example-react,io-example-vue,io-example-svelte,io-example-solid,io-example-lynx` |

## Environment Notes

- Node: `20.x` (CI baseline).
- Release candidate should be validated on macOS/Linux at least once per minor release.
- For SSR-sensitive changes, include Next/Nuxt/SvelteKit docs/examples verification.
