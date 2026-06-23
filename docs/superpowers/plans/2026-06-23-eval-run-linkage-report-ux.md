# P0-04 Eval-run Linkage and Report UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reviewer-facing verdict and next-action semantics to real-world eval case views and render them in the Workbench dashboard.

**Architecture:** Reuse `RealWorldEvalReport` and `RunRecord` as the facts source. Add a normalized `caseReview` view model in `packages/web/src/dashboard/report-model.ts`, render it in `packages/web/src/dashboard/workbench.ts`, and cover the behavior with focused Vitest tests.

**Tech Stack:** TypeScript, pnpm, Vitest, existing Web static renderer.

## Global Constraints

- Backlog item is `P0-04 Eval-run Linkage and Report UX`.
- Do not modify database migrations.
- Do not change `RunRecord` schema for this package.
- Do not derive verdicts from final text.
- Replay output with `freshExecution=false` must say `Replay result, not a fresh execution`.
- Fixture evals must not claim product health or human acceptance.

---

### Task 1: Normalize Case Review Semantics

**Files:**
- Modify: `packages/web/src/dashboard/report-model.ts`
- Test: `packages/web/src/__tests__/dashboard.test.ts`

**Interfaces:**
- Consumes: `RealWorldEvalCaseResult.runRecord`, `proofBoundary`, `passed`, `riskCompliant`, `falseSuccess`.
- Produces: `RealWorldEvalCaseView.caseReview`.

- [ ] **Step 1: Write the failing test**

Add assertions to `normalizes real-world L2 reports into case-to-run detail links without health claims`:

```ts
expect(view.cases.find((testCase) => testCase.id === "file-summary")?.caseReview).toMatchObject({
  verdict: "evidence_backed",
  label: "Evidence-backed case result",
});
expect(view.cases.find((testCase) => testCase.id === "replay-report")?.caseReview).toMatchObject({
  verdict: "replay_only",
  label: "Replay result, not a fresh execution",
});
expect(view.cases.find((testCase) => testCase.id === "no-op-automation")?.caseReview).toMatchObject({
  verdict: "needs_review",
  nextAction: "Review automation scope before treating no-op as health.",
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/dashboard.test.ts
```

Expected: FAIL because `caseReview` is missing.

- [ ] **Step 3: Implement minimal normalization**

Add `RealWorldEvalCaseReviewView`, `caseReview` on `RealWorldEvalCaseView`, and a `caseReviewFor()` helper.

- [ ] **Step 4: Run GREEN**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/dashboard.test.ts
```

Expected: PASS.

### Task 2: Render Case Review in Workbench

**Files:**
- Modify: `packages/web/src/dashboard/workbench.ts`
- Test: `packages/web/src/__tests__/eval-dashboard-workbench.test.ts`

**Interfaces:**
- Consumes: `RealWorldEvalCaseView.caseReview`.
- Produces: Eval-run linkage table with `Reviewer verdict` and `Next action` columns.

- [ ] **Step 1: Write the failing test**

Assert rendered HTML contains:

```ts
expect(html).toContain("Reviewer verdict");
expect(html).toContain("Next action");
expect(html).toContain("Blocked before reviewer acceptance");
expect(html).toContain("Replay result, not a fresh execution");
```

- [ ] **Step 2: Run RED**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/eval-dashboard-workbench.test.ts
```

Expected: FAIL because the columns are not rendered.

- [ ] **Step 3: Implement minimal renderer change**

Render `caseReview.label`, `caseReview.reason`, and `caseReview.nextAction` in the case table.

- [ ] **Step 4: Run GREEN**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/eval-dashboard-workbench.test.ts
```

Expected: PASS.

### Task 3: Documentation and Verification

**Files:**
- Create: `doc/evals/09-eval-run-linkage-report-ux-delta-2026-06-23.md`
- Modify: `doc/product/03-web-workbench-blueprint.md`
- Modify: `doc/design/05-web-dashboard.md`
- Modify: `doc/product/12-development-priority-backlog.md`

**Interfaces:**
- Consumes: P0-04 spec and implemented tests.
- Produces: Acceptance delta and documentation links.

- [ ] **Step 1: Write acceptance delta**

Record changed files, test commands, evidence, non-goals, and remaining risks for P0-04.

- [ ] **Step 2: Run targeted verification**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/dashboard.test.ts src/__tests__/eval-dashboard-workbench.test.ts
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/real-world-eval.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full gates**

Run:

```bash
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
rg "P0-04|Eval-run Linkage|caseReview|Replay result, not a fresh execution" docs/superpowers doc packages
```

Expected: all commands pass, `rg` returns the new design, docs, tests, and implementation references.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-23-eval-run-linkage-report-ux-design.md docs/superpowers/plans/2026-06-23-eval-run-linkage-report-ux.md doc/evals/09-eval-run-linkage-report-ux-delta-2026-06-23.md doc/product/03-web-workbench-blueprint.md doc/design/05-web-dashboard.md doc/product/12-development-priority-backlog.md packages/web/src/dashboard/report-model.ts packages/web/src/dashboard/workbench.ts packages/web/src/__tests__/dashboard.test.ts packages/web/src/__tests__/eval-dashboard-workbench.test.ts
git commit -m "feat: add eval run review linkage"
```
