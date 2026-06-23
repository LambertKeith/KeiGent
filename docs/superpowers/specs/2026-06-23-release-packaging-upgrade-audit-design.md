# P2-04 Release Packaging Upgrade Audit Design

## Context

P2-04 requires KeiGent to move from a development repository toward a local product path. Most release and upgrade surfaces already exist: CLI bin shim, package metadata, `configVersion: 1`, secret-safe sample config, first-run guide, upgrade-check guide, release checklist, changelog, and version compatibility documentation.

The remaining hard gap is CI evidence. The backlog explicitly calls for Node 22+ CI, but the repository currently has no `.github/workflows` definition.

## Goal

Complete P2-04 by adding a repository CI workflow that runs the existing release-quality gates on Node.js 22.19.0 and by documenting/testing that workflow as part of the release packaging audit.

## Non-Goals

- Do not publish packages.
- Do not create release tags.
- Do not add deployment automation.
- Do not run browser verification in CI until browser cache provisioning is explicit.
- Do not modify migration files or database state.

## Required Behavior

1. CI runs on push and pull request for `main` and `agent-operations-next-round`.
2. CI uses Node.js `22.19.0`.
3. CI enables Corepack and activates pnpm `10.33.2`.
4. CI runs:
   - `corepack pnpm install --frozen-lockfile`
   - `corepack pnpm verify:node`
   - `corepack pnpm -r check`
   - `corepack pnpm -r test`
   - `corepack pnpm -r --if-present build`
   - `node packages/cli/bin/keigent.mjs guide first-run --compact`
   - `node packages/cli/bin/keigent.mjs guide upgrade-check --compact`
   - `node packages/cli/bin/keigent.mjs runs list --compact`
5. CI job does not require real secrets or network model calls.
6. Release docs and backlog link to a P2-04 acceptance delta.

## Acceptance Evidence

- A test proves `.github/workflows/ci.yml` declares Node 22.19.0 and the required commands.
- Existing guide tests prove first-run, upgrade-check, and release checklist outputs.
- Config tests prove sample config, config version, and upgrade compatibility.
- Doctor tests prove actionable local diagnostics.
- Package metadata tests prove bin shim and release metadata.
- Full repo `check`, `test`, `build`, stability gate, and diff checks pass locally.
