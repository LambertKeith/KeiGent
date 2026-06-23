# Performance Budget Controls Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete P2-05 by adding a Workbench regression for `pricing_not_configured` and an independent budget-controls audit delta.

**Architecture:** Keep existing budget enforcement in LoopEngine and WorkflowRunner. Make the Web run view model display the provider cost status exactly when pricing is not configured, then document the current budget controls and verification evidence.

**Tech Stack:** TypeScript, Vitest, pnpm, existing RunRecord/Workbench view model.

## Global Constraints

- Do not add remote price syncing or hardcoded provider prices.
- Do not treat unpriced provider usage as free.
- Do not edit database migration files.
- Do not change successful budget semantics outside the explicit display fix.

---

### Task 1: Add Workbench Pricing Status Regression

**Files:**
- Modify: `packages/web/src/__tests__/runs-view.test.ts`

**Interfaces:**
- Consumes: `normalizeRunRecord(record)`
- Produces: A failing test requiring visible provider cost label `pricing_not_configured`.

- [x] **Step 1: Write the failing test**

Add a test that passes `providerUsage.costStatus = "pricing_not_configured"` and asserts:

```ts
expect(view.budget.providerUsage.costLabel).toBe("pricing_not_configured");
expect(view.budget.providerUsage.costLabel).not.toBe("$0.000000");
```

- [x] **Step 2: Run the test to verify it fails**

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts
```

Expected before implementation: FAIL because the current label is `Pricing not configured`.

### Task 2: Display Exact Provider Cost Status

**Files:**
- Modify: `packages/web/src/runs/model.ts`

**Interfaces:**
- Consumes: `ProviderUsageSummary`
- Produces: `RunProviderUsagePanel.costLabel`

- [x] **Step 1: Change unpriced cost label**

For non-priced provider usage, set `costLabel` to `usage.costStatus`.

- [x] **Step 2: Run the web test**

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts
```

Expected: PASS.

### Task 3: Add P2-05 Acceptance Delta

**Files:**
- Create: `doc/evals/21-performance-budget-controls-audit-delta-2026-06-23.md`
- Modify: `doc/evals/README.md`
- Modify: `doc/product/12-development-priority-backlog.md`
- Modify: `doc/product/09-agent-operations-maturity-roadmap.md`

**Interfaces:**
- Consumes: P2-05 backlog and verification output.
- Produces: discoverable P2-05 audit report.

- [x] **Step 1: Document budget-control proof**

The delta must map backlog requirements to tests: loop budget, workflow parent/child budget, RunRecord budget summary, Workbench budget display, eval `budget-exceeded`, and `pricing_not_configured`.

- [x] **Step 2: Link docs**

Add README/backlog/roadmap links to the new delta.

### Task 4: Verify and Commit

**Files:**
- All files changed above.

**Interfaces:**
- Consumes: repo verification commands.
- Produces: pushed P2-05 commit.

- [x] **Step 1: Run targeted tests**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/engine-budget.test.ts src/__tests__/workflow-runner.test.ts src/__tests__/real-world-eval.test.ts src/__tests__/run-record.test.ts
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts src/__tests__/run-workbench.test.ts
corepack pnpm --filter @keigent/engine eval:real-world -- --compact
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
git add docs/superpowers/specs/2026-06-23-performance-budget-controls-audit-design.md docs/superpowers/plans/2026-06-23-performance-budget-controls-audit.md packages/web/src/__tests__/runs-view.test.ts packages/web/src/runs/model.ts doc/evals/21-performance-budget-controls-audit-delta-2026-06-23.md doc/evals/README.md doc/product/12-development-priority-backlog.md doc/product/09-agent-operations-maturity-roadmap.md
git commit -m "feat: harden performance budget controls audit"
git push
```
