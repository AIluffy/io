# Self-Healing Configuration

## Confidence Rules

- Fixes involving "test" targets should require high confidence
- Formatting fixes can be applied with medium confidence

## Off-Limits Areas

- `/src/generated/` - auto-generated, do not modify
- `/legacy/` - requires manual review

## Fix Preferences

- Prefer updating ESLint rules over adding disable comments
- For type errors, prefer explicit types over `any`

## Context

See ARCHITECTURE.md for module boundaries.
