# Contributing to KeiGent

KeiGent is licensed under Apache-2.0. By submitting a contribution, you agree that your contribution is provided under the same Apache-2.0 terms unless you clearly mark it as "Not a Contribution".

## Ground Rules

- Keep changes scoped to a single product or architecture concern.
- Do not include API keys, tokens, credentials, private logs, or raw user data.
- Do not delete databases, tables, migration files, or user data.
- Do not rewrite migration history.
- Preserve existing user work and unrelated local changes.
- Prefer `corepack pnpm ...` commands from the repository root.

## Before Opening a Change

Run the release-quality gates that match the change:

```bash
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
```

For focused changes, also run the nearest package-level or file-level test first.

## Documentation

Update the relevant source of truth when behavior changes:

- Architecture facts: `doc/design/01-architecture.md`
- CLI/config behavior: `doc/design/06-cli-config-and-web-config.md`
- Workflow behavior: `doc/design/07-workflow-run-envelope.md`
- Run lifecycle: `doc/product/05-run-record-and-run-lifecycle.md`
- Release and upgrade path: `doc/product/10-release-and-upgrade.md`

Do not describe planned behavior as implemented.

## Review Expectations

Every contribution should make evidence stronger:

- New behavior needs tests.
- User-facing behavior needs reproducible verification.
- Risk, approval, replay, and evidence semantics must remain explicit.
- Secret-like values must be redacted by default.

If a change requires legal, release, database, or production policy decisions, document the decision needed instead of guessing it.
