## Summary

- 

## Release Governance (Required for release-facing changes)

- [ ] I reviewed `.github/release-checklist.md`
- [ ] I reviewed `.github/regression-matrix.md` and ran relevant matrix commands
- [ ] I reviewed `.github/incident-severity-response.md` and confirmed severity/rollback plan

## Docs & Quality Checklist

- [ ] I ran `npm run docs:check`
- [ ] I ran `npm run build -w apps/docs` (when docs were touched)
- [ ] If public API changed, API reference pages were regenerated and committed
- [ ] Examples and snippets match the shipped API
