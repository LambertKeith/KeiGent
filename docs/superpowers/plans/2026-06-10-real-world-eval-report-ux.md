# Real-world Eval Report UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement roadmap M2-A so real-world L2 eval reports can be inspected without false health claims and each case links to its RunRecord detail.

**Architecture:** Keep engine report generation as the source of truth. Add a Web view-model adapter for `RealWorldEvalReport`, expose run detail hrefs from `case.runId`, and make CLI compact output assert the same linkage fields.

**Tech Stack:** TypeScript, Vitest, pnpm workspace packages `@keigent/engine`, `@keigent/web`, and `@keigent/cli`.

---

### Task 1: Web Real-world Report View Model

**Files:**
- Modify: `packages/web/src/dashboard/report-model.ts`
- Test: `packages/web/src/__tests__/dashboard.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that imports `runRealWorldEvalCases`, `DEFAULT_REAL_WORLD_L2_CASES`, and `createRealWorldFixtureExecutor` from `@keigent/engine`; calls `normalizeRealWorldEvalReport(report)`; asserts:

```ts
expect(view.level).toBe("L2");
expect(view.healthClaim).toBe("Fixture-level regression, not product health");
expect(view.metrics).toMatchObject({
  routeAccuracy: { value: 1, label: "100.0%" },
  taskSuccessRate: { value: 0.25, label: "25.0%" },
});
expect(view.cases.find((testCase) => testCase.id === "no-op-automation")).toMatchObject({
  runId: "run_no-op-automation",
  runDetailHref: "#runs/run_no-op-automation",
  result: "no_op",
});
expect(view.falseConfidenceFindings.length).toBeGreaterThan(0);
```

- [ ] **Step 2: Run the red test**

Run: `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/dashboard.test.ts`

Expected: FAIL because `normalizeRealWorldEvalReport` is not exported.

- [ ] **Step 3: Implement the minimal view model**

Add `RealWorldEvalReportView`, `RealWorldEvalCaseView`, metric formatting helpers, `runDetailHrefFor(runId)`, and `normalizeRealWorldEvalReport(report)` in `packages/web/src/dashboard/report-model.ts`.

- [ ] **Step 4: Run the green test**

Run: `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/dashboard.test.ts`

Expected: PASS.

### Task 2: CLI Real-world Linkage Assertions

**Files:**
- Modify: `packages/cli/src/__tests__/eval-commands.test.ts`

- [ ] **Step 1: Write the failing test**

Extend the real-world CLI compact test to assert the parsed report includes:

```ts
const replay = report.cases.find((testCase: { id: string }) => testCase.id === "replay-report");
expect(replay).toMatchObject({
  runId: "run_replay-report",
  runRecord: { id: "run_replay-report", replay: { freshExecution: false } },
});
```

- [ ] **Step 2: Run the red/green test**

Run: `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/eval-commands.test.ts`

Expected: PASS if engine report already emits linkage; otherwise implement the missing engine/CLI field and rerun.

### Task 3: Verification

**Files:**
- Verify workspace-wide behavior.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/dashboard.test.ts
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/eval-commands.test.ts
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/real-world-eval.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run quality gates**

Run:

```bash
corepack pnpm -r test
corepack pnpm -r check
corepack pnpm -r --if-present build
```

Expected: all pass.

### Self-review

- Spec coverage: Covers roadmap M2-A linkage, independent false-confidence display, separate metrics, and replay/fresh distinction. M2-B case expansion is already covered by existing worktree changes and remains verified by engine tests.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Uses existing engine `RealWorldEvalReport` and adds only Web view model types.
