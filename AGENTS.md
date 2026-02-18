# AGENTS.md - IO Monorepo Guidelines

## Build Commands (Nx)

Always use Nx through a non-pnpm runner (`npm exec nx -- ...`):

```bash
# Build a single project
npm exec nx -- run <project>:build

# Run all tests
npm exec nx -- run-many -t test

# Run single test file (Vitest filter argument)
npm exec nx -- run <project>:test -- <filename> --run

# Run specific test
npm exec nx -- run <project>:test -- -t "<test name>" --run

# Lint a project
npm exec nx -- run <project>:lint

# Type check a project
npm exec nx -- run <project>:typecheck

# Run affected tests (based on git changes)
npm exec nx -- affected -t test

# Build all projects
npm exec nx -- run-many -t build
```

## Docs Site (Astro/Starlight)

- Dev server: `npm exec nx -- run apps-docs:dev`
- Production build: `npm exec nx -- run apps-docs:build`
- Preview build: `npm exec nx -- run apps-docs:preview`
- API docs generation: `npm exec nx -- run apps-docs:generate-api` (runs `tools/docs/generate-api-docs.mjs`)
- Root route serves `zh-cn` docs by default (no redirect page)
- CI deploy entry (single source): `.github/workflows/deploy-docs.yml`
- CI deploy target: Vercel production (triggered by GitHub Actions)
- Required GitHub Secrets for docs deploy: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

### Available Projects

- Prefer dynamic discovery: `npm exec nx -- show projects`
- Core library: `@iostore/store` (`packages/io`)
- Framework adapters: `@iostore/react`, `@iostore/vue`, `@iostore/svelte`, `@iostore/solid`, `@iostore/lynx`
- DevTools: `@iostore/devtools`, `@iostore/devtools-react`
- Skills package: `@iostore/skill`
- Docs site: `apps-docs` (`apps/docs`)
- Examples: `io-example-vanilla`, `io-example-react`, `io-example-vue`, `io-example-svelte`, `io-example-solid`, `io-example-lynx`
- Workspace root project: `io-source` (root `package.json`)

### Local Registry (Verdaccio)

- Start local registry: `npm exec nx -- run io-source:local-registry`
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
- Run `npm exec nx -- run <project>:lint -- --fix` to auto-fix (`lint` without `--fix` only checks)

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
- If `nx-workspace` is unavailable, fall back to Nx CLI: `npm exec nx -- show projects` and `npm exec nx -- show project <project> --json`
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `npm exec nx -- run`, `npm exec nx -- run-many`, `npm exec nx -- affected`) instead of using the underlying tooling directly
- Do not use `pnpm` to execute commands in this workspace
- Prefix Nx commands with a non-pnpm runner (prefer `npm exec nx -- ...`; `npx nx ...` is acceptable)
- If Nx MCP is unavailable, continue with Nx CLI and command help (`npm exec nx -- --help`, `npm exec nx -- run <project>:<target> --help`)
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools
- If `nx-generate` is unavailable, use `npm exec nx -- g ...` and `npm exec nx -- list` as fallback

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`npm exec nx -- g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

## Skills

A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill.

### Available skills

- doc: Use when the task involves reading, creating, or editing `.docx` documents, especially when formatting or layout fidelity matters; prefer `python-docx` plus the bundled `scripts/render_docx.py` for visual checks. (file: /Users/zhangxueai/.codex/skills/doc/SKILL.md)
- gh-address-comments: Help address review/issue comments on the open GitHub PR for the current branch using gh CLI; verify gh auth first and prompt the user to authenticate if not logged in. (file: /Users/zhangxueai/.codex/skills/gh-address-comments/SKILL.md)
- gh-fix-ci: Use when a user asks to debug or fix failing GitHub PR checks that run in GitHub Actions; use `gh` to inspect checks and logs, summarize failure context, draft a fix plan, and implement only after explicit approval. Treat external providers (for example Buildkite) as out of scope and report only the details URL. (file: /Users/zhangxueai/.codex/skills/gh-fix-ci/SKILL.md)
- vercel-deploy: Deploy applications and websites to Vercel. Use when the user requests deployment actions like "deploy my app", "deploy and give me the link", "push this live", or "create a preview deployment". (file: /Users/zhangxueai/.codex/skills/vercel-deploy/SKILL.md)
- yeet: Use only when the user explicitly asks to stage, commit, push, and open a GitHub pull request in one flow using the GitHub CLI (`gh`). (file: /Users/zhangxueai/.codex/skills/yeet/SKILL.md)
- skill-creator: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations. (file: /Users/zhangxueai/.codex/skills/.system/skill-creator/SKILL.md)
- skill-installer: Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos). (file: /Users/zhangxueai/.codex/skills/.system/skill-installer/SKILL.md)

### How to use skills

- Discovery: The list above is the skills available in this session (name + description + file path). Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description shown above, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill isn't in the list or the path can't be read, say so briefly and continue with the best fallback.
- How to use a skill (progressive disclosure):
  1. After deciding to use a skill, open its `SKILL.md`. Read only enough to follow the workflow.
  2. When `SKILL.md` references relative paths (e.g., `scripts/foo.py`), resolve them relative to the skill directory listed above first, and only consider other paths if needed.
  3. If `SKILL.md` points to extra folders such as `references/`, load only the specific files needed for the request; don't bulk-load everything.
  4. If `scripts/` exist, prefer running or patching them instead of retyping large code blocks.
  5. If `assets/` or templates exist, reuse them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you'll use them.
  - Announce which skill(s) you're using and why (one short line). If you skip an obvious skill, say why.
- Context hygiene:
  - Keep context small: summarize long sections instead of pasting them; only load extra files when needed.
  - Avoid deep reference-chasing: prefer opening only files directly linked from `SKILL.md` unless you're blocked.
  - When variants exist (frameworks, providers, domains), pick only the relevant reference file(s) and note that choice.
- Safety and fallback: If a skill can't be applied cleanly (missing files, unclear instructions), state the issue, pick the next-best approach, and continue.

## Read in Advance

Read docs below in advance to help you understand the library or frameworks this project depends on.

- Lynx: [llms.txt](https://lynxjs.org/llms.txt).
  While dealing with a Lynx task, an agent **MUST** read this doc because it is an entrypoint of all available docs about Lynx.
