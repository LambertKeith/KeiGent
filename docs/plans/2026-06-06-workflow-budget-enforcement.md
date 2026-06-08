# Workflow Per-Run Budget Enforcement Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Close the false-confidence gap where a child runner can ignore `maxIterationsPerRun` and still let the workflow succeed.

**Architecture:** Keep Workflow P0 as a thin run envelope. The child runner still receives `options.maxIterations`; the workflow runner additionally validates the returned child `LoopResult.iterations` against `WorkflowBudget.maxIterationsPerRun`, preserves all child evidence, and maps violations to `budget_exceeded`.

**Tech Stack:** TypeScript, Vitest, `@keigent/engine` workflow runner tests.

---

## Acceptance Criteria

1. `WorkflowRunner` passes `spec.budget.maxIterationsPerRun` to `WorkflowChildRunner.runChild(options.maxIterations)`.
2. If a child result reports `iterations > spec.budget.maxIterationsPerRun`, workflow exit is deterministically `budget_exceeded`, even if the child exit reason is `success`.
3. Budget failure preserves child facts:
   - `result.childRuns[0].result` is the original child result.
   - `result.childRuns[0].trajectory` is preserved.
   - `result.trajectory.childRuns[0].trajectory` is preserved.
4. Budget failure emits exactly one terminal `workflow_done` event, and the terminal event has `exitReason: "budget_exceeded"`.
5. Evidence includes a failed `budget` item describing `maxIterationsPerRun`.
6. The slice does not call real LLM/browser/network/tools.
7. Verification commands pass:
   - `corepack pnpm --filter @keigent/engine test --run workflow-runner.test.ts`
   - `corepack pnpm --filter @keigent/engine test --run workflow-runner.test.ts workflow-planner.test.ts workflow-trajectory.test.ts eval-runner.test.ts eval-replay.test.ts public-api.test.ts`
   - `corepack pnpm --filter @keigent/engine check`

## Task 1: Add failing tests for per-run iteration budget

**Files:**
- Modify: `packages/engine/src/__tests__/workflow-runner.test.ts`

**Steps:**
1. Add a test proving `options.maxIterations` equals `spec.budget.maxIterationsPerRun`.
2. Add a test proving child-reported iterations above `maxIterationsPerRun` produce `budget_exceeded` while preserving child result/trajectory and terminal event semantics.
3. Run targeted test and verify the second test fails before implementation.

## Task 2: Enforce child result iteration budget in WorkflowRunner

**Files:**
- Modify: `packages/engine/src/workflow/runner.ts`

**Steps:**
1. Extend budget checking to inspect child runs as well as aggregate usage.
2. Return a budget failure for any child whose `result.iterations` exceeds `spec.budget.maxIterationsPerRun`.
3. Include a diagnostic evidence message mentioning `maxIterationsPerRun`.
4. Run targeted and broader checks.

## Non-goals

- No CLI main-path workflow integration in this slice.
- No fanout/tournament/verifier child/quarantine.
- No claim that this improves agent task quality; it only hardens workflow budget truthfulness and evidence preservation.
