# P2-01 Readonly Connector Baseline Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a current, independently verifiable P2-01 readonly connector baseline acceptance package.

**Architecture:** Treat the existing connector implementation as the subject under audit. Do not duplicate connector code; instead bind the current ToolRegistry, source evidence, redaction, failure mapping, and workflow evidence behavior to an explicit spec, plan, acceptance delta, and fresh verification commands.

**Tech Stack:** TypeScript, pnpm, Vitest, existing `@keigent/engine` ToolRegistry and workflow evidence model.

## Global Constraints

- Backlog item is `P2-01 Readonly Connector Baseline`.
- Do not add write-capable connector behavior.
- Do not introduce credential, token, custom header, or OAuth support.
- Do not treat connector text as sufficient business success evidence.
- Keep verification deterministic except local loopback HTTP tests already covered by Vitest.

---

### Task 1: Current Baseline Audit Documents

**Files:**
- Create: `docs/superpowers/specs/2026-06-23-readonly-connector-baseline-audit-design.md`
- Create: `docs/superpowers/plans/2026-06-23-readonly-connector-baseline-audit.md`
- Create: `doc/evals/17-readonly-connector-baseline-audit-delta-2026-06-23.md`
- Modify: `doc/evals/README.md`
- Modify: `doc/product/12-development-priority-backlog.md`
- Modify: `doc/product/09-agent-operations-maturity-roadmap.md`

**Interfaces:**
- Consumes: P2-01 backlog requirements and existing readonly connector tests.
- Produces: current spec, implementation/audit plan, eval delta, and product traceability.

- [x] **Step 1: Write current spec**

Document the current P2-01 contract:

```text
readonly connector -> ToolRegistry -> structured sources -> evidence bundle -> sourceCollected assertion
```

- [x] **Step 2: Write audit plan**

Document exact files, commands, proof boundary, and commit steps.

- [x] **Step 3: Write acceptance delta**

Create the P2-01 acceptance delta with changed files, tests, evidence, proof boundary, and remaining risks.

- [x] **Step 4: Run target verification**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/failures.test.ts src/__tests__/readonly-connector-sources.test.ts src/__tests__/http-readonly-tool.test.ts src/__tests__/github-readonly-tool.test.ts src/__tests__/git-tool.test.ts src/__tests__/success-evidence.test.ts src/__tests__/workflow-runner.test.ts src/__tests__/public-api.test.ts
```

Expected: PASS.

- [x] **Step 5: Run final verification**

```bash
corepack pnpm --filter @keigent/engine eval:stability -- --compact
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
rg "P2-01|Readonly Connector Baseline|readonly connector|sourceCollected|github_repo_read|http_get|git_status" docs/superpowers doc packages
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-06-23-readonly-connector-baseline-audit-design.md docs/superpowers/plans/2026-06-23-readonly-connector-baseline-audit.md doc/evals/17-readonly-connector-baseline-audit-delta-2026-06-23.md doc/evals/README.md doc/product/12-development-priority-backlog.md doc/product/09-agent-operations-maturity-roadmap.md
git commit -m "docs: add readonly connector baseline audit"
```
