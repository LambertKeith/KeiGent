# P1-01 Reviewed-loop v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before implementation. Track steps with checkbox syntax.

**Goal:** Productize reviewed-loop by making reviewer readonly policy explicit and regression-tested.

**Architecture:** Keep the single `LoopEngine` and existing workflow envelope. Add explicit `reviewerReadonly` policy semantics, normalize reviewed-loop policy in planner/runner, and document acceptance evidence.

**Tech Stack:** TypeScript, pnpm, Vitest, existing workflow runner/planner/policy modules.

## Global Constraints

- Backlog item is `P1-01 Reviewed-loop v1`.
- Do not create a second loop.
- Do not change RunRecord schema.
- Do not make reviewer a human acceptance substitute.
- Reviewer must remain readonly even if caller passes a wide policy.

---

### Task 1: Reviewed-loop Policy Contract

**Files:**
- Modify: `packages/engine/src/workflow/types.ts`
- Modify: `packages/engine/src/workflow/planner.ts`
- Modify: `packages/engine/src/workflow/policy.ts`
- Test: `packages/engine/src/__tests__/workflow-planner.test.ts`
- Test: `packages/engine/src/__tests__/workflow-policy.test.ts`

- [x] **Step 1: Write failing tests**

Assert reviewed-loop spec policy includes:

```ts
{
  reviewerReadonly: true,
  verifierReadonly: true,
  maxPermission: "readonly",
  maxRiskLevel: "R0",
  allowExternalSideEffects: false,
}
```

Assert `reviewerReadonly` blocks write/external reviewer tools.

- [x] **Step 2: Run RED**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/workflow-planner.test.ts src/__tests__/workflow-policy.test.ts
```

Expected: FAIL because `reviewerReadonly` is not implemented.

- [x] **Step 3: Implement policy contract**

Add `reviewerReadonly` to `WorkflowPolicy`, normalize reviewed-loop policy, and update policy helper.

- [x] **Step 4: Run GREEN**

Run the same focused tests and expect PASS.

### Task 2: Runner Enforcement

**Files:**
- Modify: `packages/engine/src/workflow/runner.ts`
- Test: `packages/engine/src/__tests__/workflow-runner.test.ts`

- [x] **Step 1: Write failing runner tests**

Assert reviewer child receives readonly policy even when spec policy is wider. Assert reviewer success cannot override worker error.

- [x] **Step 2: Run RED**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/workflow-runner.test.ts
```

Expected: FAIL before runner policy normalization is added.

- [x] **Step 3: Implement runner enforcement**

Create a helper that returns reviewer readonly policy and use it for reviewer child specs.

- [x] **Step 4: Run GREEN**

Run focused runner tests and expect PASS.

### Task 3: Docs and Acceptance

**Files:**
- Create: `doc/evals/12-reviewed-loop-v1-delta-2026-06-23.md`
- Modify: `doc/evals/README.md`
- Modify: `doc/product/12-development-priority-backlog.md`

- [x] **Step 1: Document delta**

Write changed files, tests, proof boundary, and remaining risks.

- [x] **Step 2: Run verification**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/workflow-planner.test.ts src/__tests__/workflow-policy.test.ts src/__tests__/workflow-runner.test.ts src/__tests__/real-world-eval.test.ts
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts
corepack pnpm --filter @keigent/engine eval:stability -- --compact
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
rg "P1-01|Reviewed-loop v1|reviewerReadonly|reviewer readonly" docs/superpowers doc packages
```

Expected: all commands pass.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-23-reviewed-loop-v1-design.md docs/superpowers/plans/2026-06-23-reviewed-loop-v1.md doc/evals/12-reviewed-loop-v1-delta-2026-06-23.md doc/evals/README.md doc/product/12-development-priority-backlog.md packages/engine/src/workflow/types.ts packages/engine/src/workflow/planner.ts packages/engine/src/workflow/policy.ts packages/engine/src/workflow/runner.ts packages/engine/src/__tests__/workflow-planner.test.ts packages/engine/src/__tests__/workflow-policy.test.ts packages/engine/src/__tests__/workflow-runner.test.ts
git commit -m "feat: harden reviewed loop policy"
```
