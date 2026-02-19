# Release Checklist

Use this checklist for release PRs and any high-risk feature merge to `main`.

## 1. Scope and Versioning

- [ ] Scope of release is documented (projects/packages touched).
- [ ] Semver impact is confirmed (`patch` / `minor` / `major`).
- [ ] Breaking changes are explicitly called out in release notes.

## 2. Quality Gates

- [ ] `npm exec nx run-many -t lint test typecheck build` passed.
- [ ] `npm exec nx run @iostore/store:bundle-size` passed.
- [ ] `npm exec nx run @iostore/store:perf-budget` passed (or waiver approved).

## 3. Regression Matrix

- [ ] Required P0 matrix cases in `.github/regression-matrix.md` passed.
- [ ] Failures (if any) have explicit risk acceptance and owner.

## 4. API and Docs

- [ ] Public API changes are reflected in docs and package READMEs.
- [ ] Migration notes are added for behavior changes.
- [ ] Examples and snippets are verified against shipped API.

## 5. Release Safety

- [ ] Rollback strategy is defined (revert commit or hotfix branch owner).
- [ ] Monitoring window and on-call owner are assigned.
- [ ] Error response flow `.github/incident-severity-response.md` is acknowledged.
