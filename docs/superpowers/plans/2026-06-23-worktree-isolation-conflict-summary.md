# P1-03 Worktree Isolation Conflict Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before implementation. Track steps with checkbox syntax.

**Goal:** Make workflow-level child workspace summaries report cross-child artifact conflicts when workspace isolation is enabled.

**Architecture:** Keep `worktree-isolation.ts` as the primitive layer. Change `WorkflowRunner` so child execution collects workspace artifacts first, then computes cross-child conflicts across all child workspace summaries before returning `WorkflowResult` and `WorkflowTrajectory`.

**Tech Stack:** TypeScript, pnpm, Vitest, existing workflow runner, worktree isolation helpers, RunRecord / Workbench regression tests.

## Global Constraints

- Backlog item is `P1-03 Worktree Isolation Foundation`.
- Do not implement fanout, tournament, automatic merge, or real `git worktree add`.
- Do not let reviewer write worker workspace.
- Preserve explicit opt-in semantics for `workspaceIsolation`.
- Do not modify migration files.

---

### Task 1: Workflow Conflict Summary

**Files:**
- Modify: `packages/engine/src/workflow/runner.ts`
- Test: `packages/engine/src/__tests__/workflow-runner.test.ts`

**Interfaces:**
- Consumes: `WorkflowRunner.run(spec)` and `detectWorkspaceConflicts([{ workspace, artifacts }])`.
- Produces: `ChildRunResult.workspace.conflicts` populated with conflicts involving that child workspace.

- [x] **Step 1: Write failing reviewed-loop conflict test**

Add a test where reviewed-loop has `workspaceIsolation`, worker writes `shared/result.txt`, reviewer also writes `shared/result.txt`, and both child workspace summaries include:

```ts
{
  relativePath: "shared/result.txt",
  workspaceIds: ["ws_wf_isolated_conflict_worker_1", "ws_wf_isolated_conflict_reviewer_1"],
  childRunIds: ["wf-isolated-conflict:worker-1", "wf-isolated-conflict:reviewer-1"],
}
```

Also assert `result.trajectory.childRuns` contains the same conflict.

- [x] **Step 2: Run RED**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/workflow-runner.test.ts
```

Observed: FAIL because each child workspace was summarized independently and conflicts were empty.

- [x] **Step 3: Implement cross-child conflict assignment**

Change `WorkflowRunner` to:

1. summarize each workspace with artifacts and cleanup state but without final conflicts;
2. after child runs are known, call `detectWorkspaceConflicts()` with every workspace summary that has artifacts;
3. assign each conflict back to every child summary whose `workspaceId` appears in `conflict.workspaceIds`;
4. keep `WorkflowTrajectory` using the updated child summaries.

- [x] **Step 4: Run GREEN**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/workflow-runner.test.ts
```

Observed: PASS, 1 test file / 26 tests.

### Task 2: Docs and Acceptance

**Files:**
- Create: `docs/superpowers/specs/2026-06-23-worktree-isolation-conflict-summary-design.md`
- Create: `docs/superpowers/plans/2026-06-23-worktree-isolation-conflict-summary.md`
- Create: `doc/evals/14-worktree-isolation-conflict-summary-delta-2026-06-23.md`
- Modify: `doc/evals/README.md`
- Modify: `doc/product/12-development-priority-backlog.md`
- Modify: `doc/design/01-architecture.md`
- Modify: `doc/design/14-worktree-isolation-and-parallel-runs.md`

**Interfaces:**
- Consumes: P1-03 backlog and design fact source.
- Produces: spec, plan, eval delta, and corrected architecture traceability.

- [x] **Step 1: Document product contract**

Write a spec that states workflow-level conflict summaries are cross-child and opt-in only.

- [x] **Step 2: Document implementation plan**

Write this plan with TDD RED/GREEN steps and exact verification commands.

- [x] **Step 3: Document acceptance delta**

Create `doc/evals/14-worktree-isolation-conflict-summary-delta-2026-06-23.md` with changed files, tests, evidence, proof boundary, and risks.

- [x] **Step 4: Run final verification**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/workflow-runner.test.ts src/__tests__/worktree-isolation.test.ts src/__tests__/run-record.test.ts
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts
corepack pnpm --filter @keigent/engine eval:stability -- --compact
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
rg "P1-03|Worktree Isolation|workspaceIsolation|conflict summary|detectWorkspaceConflicts" docs/superpowers doc packages
```

Observed: all commands passed.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-06-23-worktree-isolation-conflict-summary-design.md docs/superpowers/plans/2026-06-23-worktree-isolation-conflict-summary.md doc/evals/14-worktree-isolation-conflict-summary-delta-2026-06-23.md doc/evals/README.md doc/product/12-development-priority-backlog.md doc/design/01-architecture.md doc/design/14-worktree-isolation-and-parallel-runs.md packages/engine/src/workflow/runner.ts packages/engine/src/__tests__/workflow-runner.test.ts
git commit -m "feat: summarize workflow workspace conflicts"
```
