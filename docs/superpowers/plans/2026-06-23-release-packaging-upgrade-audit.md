# Release Packaging Upgrade Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete P2-04 by adding Node 22.19 CI evidence and an independent release / upgrade audit delta.

**Architecture:** Keep existing CLI release guides as read-only product surfaces. Add a GitHub Actions workflow at `.github/workflows/ci.yml` and a metadata test that verifies the CI release gates stay aligned with `doc/product/10-release-and-upgrade.md`.

**Tech Stack:** GitHub Actions YAML, Node.js 22.19.0, Corepack pnpm 10.33.2, TypeScript, Vitest.

## Global Constraints

- Do not publish packages or create tags.
- Do not run secret-bearing online model checks.
- Do not modify database migration files.
- CI must use existing deterministic gates and clean bin shim commands.
- P2-04 docs must preserve proof boundaries: guides/checklists do not execute gates or prove release readiness.

---

### Task 1: Add CI Workflow Regression Test

**Files:**
- Modify: `packages/cli/src/__tests__/package-metadata.test.ts`

**Interfaces:**
- Consumes: `.github/workflows/ci.yml`
- Produces: A failing test that requires Node 22.19.0 CI and release gate commands.

- [x] **Step 1: Write the failing test**

Add a test that reads `.github/workflows/ci.yml` and asserts it contains:

```ts
expect(workflow).toContain("node-version: 22.19.0");
expect(workflow).toContain("corepack prepare pnpm@10.33.2 --activate");
expect(workflow).toContain("corepack pnpm verify:node");
expect(workflow).toContain("corepack pnpm -r check");
expect(workflow).toContain("corepack pnpm -r test");
expect(workflow).toContain("corepack pnpm -r --if-present build");
expect(workflow).toContain("node packages/cli/bin/keigent.mjs guide first-run --compact");
expect(workflow).toContain("node packages/cli/bin/keigent.mjs guide upgrade-check --compact");
expect(workflow).toContain("node packages/cli/bin/keigent.mjs runs list --compact");
```

- [x] **Step 2: Run the test to verify it fails**

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/package-metadata.test.ts
```

Expected before workflow: FAIL because `.github/workflows/ci.yml` does not exist.

### Task 2: Add Node 22.19 CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: root `package.json` packageManager and scripts.
- Produces: deterministic CI gate for P2-04.

- [x] **Step 1: Create workflow**

Workflow must run on push and pull request for `main` and `agent-operations-next-round`, use `actions/setup-node@v4` with `node-version: 22.19.0`, enable Corepack, prepare pnpm 10.33.2, install with frozen lockfile, then run the required gates.

- [x] **Step 2: Re-run package metadata test**

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/package-metadata.test.ts
```

Expected: PASS.

### Task 3: Add P2-04 Acceptance Delta

**Files:**
- Create: `doc/evals/20-release-packaging-upgrade-audit-delta-2026-06-23.md`
- Modify: `doc/evals/README.md`
- Modify: `doc/product/12-development-priority-backlog.md`
- Modify: `doc/product/09-agent-operations-maturity-roadmap.md`
- Modify: `doc/product/10-release-and-upgrade.md`

**Interfaces:**
- Consumes: P2-04 backlog and existing release guide tests.
- Produces: discoverable P2-04 audit report.

- [x] **Step 1: Document proof boundary**

The delta must state that CI workflow presence and local tests do not prove GitHub hosted CI has run on a PR.

- [x] **Step 2: Link audit docs**

Add README/backlog/roadmap links and update release checklist to mention the CI workflow file.

### Task 4: Verify and Commit

**Files:**
- All files changed above.

**Interfaces:**
- Consumes: repo verification commands.
- Produces: pushed P2-04 commit.

- [x] **Step 1: Run targeted tests**

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/package-metadata.test.ts src/__tests__/guide-command.test.ts src/__tests__/config.test.ts src/__tests__/config-doctor.test.ts
corepack pnpm --filter @keigent/engine eval:stability -- --compact
```

- [x] **Step 2: Run full gates**

```bash
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
```

- [x] **Step 3: Commit and push**

```bash
git add .github/workflows/ci.yml docs/superpowers/specs/2026-06-23-release-packaging-upgrade-audit-design.md docs/superpowers/plans/2026-06-23-release-packaging-upgrade-audit.md packages/cli/src/__tests__/package-metadata.test.ts doc/evals/20-release-packaging-upgrade-audit-delta-2026-06-23.md doc/evals/README.md doc/product/12-development-priority-backlog.md doc/product/09-agent-operations-maturity-roadmap.md doc/product/10-release-and-upgrade.md
git commit -m "feat: add release packaging ci audit"
git push
```
