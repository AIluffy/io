# AGENTS.md - IO Monorepo Guidelines

## Build Commands (Nx)

Always use `nx` instead of direct tool invocation:

```bash
# Build a single project
nx run <project>:build

# Run all tests
nx run-many -t test

# Run single test file
nx run <project>:test --testPathPattern=<filename>

# Run specific test
nx run <project>:test --testNamePattern="<test name>"

# Lint a project
nx run <project>:lint

# Type check a project
nx run <project>:typecheck

# Run affected tests (based on git changes)
nx affected -t test

# Build all projects
nx run-many -t build
```

## Docs Site (Astro/Starlight)

- Dev server: `nx run apps-docs:dev`
- Production build: `nx run apps-docs:build`
- Preview build: `nx run apps-docs:preview`
- API docs generation: `nx run apps-docs:generate-api` (runs `tools/docs/generate-api-docs.mjs`)
- Root route serves `zh-cn` docs by default (no redirect page)
- CI deploy entry (single source): `.github/workflows/deploy-docs.yml`
- CI deploy target: Vercel production (triggered by GitHub Actions)
- Required GitHub Secrets for docs deploy: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

### Available Projects

- Core library: `io-store` (`packages/io`)
- Framework adapters: `io-react`, `io-vue`, `io-svelte`
- DevTools: `io-devtools`, `io-devtools-react`
- Docs site: `apps-docs` (`apps/docs`)
- Examples: `io-example-vanilla`, `io-example-react`, `io-example-vue`, `io-example-svelte`
- Workspace root project: `io-source` (root `package.json`)

### Local Registry (Verdaccio)

- Start local registry: `nx run io-source:local-registry`
- Storage directory: `tmp/local-registry/storage`

## Code Style Guidelines

### TypeScript Configuration

- Target: ES2022 with NodeNext module resolution
- Strict mode enabled
- Unused locals must be eliminated
- No implicit returns or overrides
- Declaration maps emitted

### Formatting (Prettier)

- Single quotes only
- Run `nx run <project>:lint` to auto-fix

### Import Style

```typescript
// Order: types first, then local imports
import type { SomeType } from './types.js';
import { helperFunction } from './utils.js';

// Internal symbol naming
const INTERNAL = Symbol.for('@org/io/internal');
```

### Naming Conventions

- **Functions**: camelCase (`createUnit`, `applyUpdate`)
- **Types**: PascalCase with `Io` prefix (`IoUnit`, `IoScope`)
- **Internal functions**: camelCase, descriptive
- **Constants**: UPPER_SNAKE_CASE or camelCase for private

### Error Handling

```typescript
// Always emit errors through debug system
try {
  // operation
} catch (error) {
  emitError(target, error, path, 'operationName');
  throw error;
}
```

### Type Safety

- Use `unknown` instead of `any`
- Explicit return types on exported functions
- Type guards for runtime checks (`isUnit`, `isPlainObject`)
- Branded types for internal markers

### Testing (Vitest)

```typescript
import { describe, expect, it } from 'vitest';

describe('feature', () => {
  it('should behave correctly', () => {
    expect(result).toBe(expected);
  });
});
```

### Module Boundaries

Projects use Nx tags for dependency constraints:

- `scope:io` - Core library
- `scope:io-react`, `scope:io-vue`, `scope:io-svelte` - Adapters
- `scope:io-devtools` - DevTools

### Key Patterns

1. **Snapshot safety**: Always return frozen snapshots
2. **COW updates**: Use `createDraft`/`finishDraft` for mutations
3. **Batching**: Wrap multiple updates in `batch()`
4. **Subscription cleanup**: Always return unsubscribe function

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Do not use `pnpm` to execute commands in this workspace
- Prefix nx commands with a non-pnpm runner (e.g., `npm exec nx build`, `npx nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
