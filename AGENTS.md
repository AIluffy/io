# AGENTS.md - OIN Monorepo Guidelines

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
- Root route should show the English homepage via `apps/docs/src/pages/index.astro` redirecting to `/en/`

### Available Projects

- `@oin/store` - Core library
- `@oin/react`, `@oin/vue`, `@oin/svelte` - Framework adapters
- `@oin/devtools`, `@oin/devtools-react` - DevTools
- `apps-docs` - Documentation site
- `oin-example-core-node`, `oin-example-react-vite`, `oin-example-vue-vite`, `oin-example-svelte-vite` - Examples
- `@org/source` - Workspace root

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
const INTERNAL = Symbol.for('@org/oin/internal');
```

### Naming Conventions

- **Functions**: camelCase (`createUnit`, `applyUpdate`)
- **Types**: PascalCase with `Oin` prefix (`OinUnit`, `OinScope`)
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

- `scope:oin` - Core library
- `scope:oin-react`, `scope:oin-vue`, `scope:oin-svelte` - Adapters
- `scope:oin-devtools` - DevTools

### Key Patterns

1. **Snapshot safety**: Always return frozen snapshots
2. **COW updates**: Use `createDraft`/`finishDraft` for mutations
3. **Batching**: Wrap multiple updates in `batch()`
4. **Subscription cleanup**: Always return unsubscribe function

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.

<!-- nx configuration end-->
