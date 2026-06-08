# Workflow Envelope Production Hardening Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Close the next production false-confidence gaps after moving Workflow Envelope into the CLI path: CLI failures must be externally visible, and workflow timeout must propagate cancellation into the real LoopEngine/tool execution boundary.

**Architecture:** Keep WorkflowRunner as the parent envelope for budgets, terminal result, evidence, and workflow trajectory. Add a thin cancellation path from WorkflowRunner → engine child adapter → LoopEngine → ToolRegistry/ToolContext, with explicit abort checks at side-effect boundaries. Do not introduce schedulers, concurrent child orchestration, or new product claims in this slice.

**Tech Stack:** TypeScript, Vitest, pnpm workspace via `corepack pnpm`, KeiGent engine/CLI packages.

---

## Selected maturity boundary

This autonomous round will complete two production-grade slices:

1. **P0: CLI Workflow Envelope failure semantics are commit-ready.**
   - `runOnce()` must set non-zero exit code for workflow failure and unexpected exceptions.
   - failed workflow must not trigger learning.
   - the behavior must be covered by CLI tests.

2. **P1: Workflow timeout cancellation reaches production execution boundaries.**
   - `AbortSignal` must not stop at `WorkflowChildRunner` interface level.
   - It must be passed to the production engine child adapter, LoopEngine, ToolContext, and ToolRegistry.
   - LoopEngine must stop before continuing LLM/tool/checkpoint/memory side effects when aborted.

## Non-goals

- No fanout/tournament/multi-worker workflow implementation.
- No verifier-child product mode in this slice.
- No policy enforcement implementation in this slice.
- No guarantee that every third-party library can be force-killed mid-await; the minimum guarantee is that KeiGent boundaries stop scheduling subsequent side effects and ToolRegistry returns promptly on parent abort.
- No commit/push unless explicitly requested later.

## Blocking acceptance criteria

### CLI failure semantics

- `runOnce()` with a non-success workflow result sets `process.exitCode = 1`.
- `runOnce()` with an unexpected exception sets `process.exitCode = 1`.
- `runOnce()` success does not set a failure exit code.
- failed workflow saves workflow trajectory but does not call learner or persist child trajectory as a success sample.

### Abort/cancellation semantics

- `createEngineWorkflowChildRunner()` passes the workflow `AbortSignal` to `engine.run()`.
- `LoopEngine.run()` accepts an optional `{ signal }` without breaking existing callers.
- already-aborted engine run exits promptly without calling LLM/tools.
- LoopEngine checks abort before/after LLM, before/after tool execution, around checkpoint capture/verify/recover, and before memory persistence.
- `ToolContext` includes optional `signal`.
- `ToolRegistry.execute()` refuses to start already-aborted work and returns promptly if signal aborts during tool execution.
- workflow timeout remains final `exitReason: "timeout"`; late child success must not overwrite the parent result.

### Verification commands

Run and pass:

```bash
corepack pnpm --filter @keigent/cli test
corepack pnpm --filter @keigent/engine test
corepack pnpm -r check
corepack pnpm --filter @keigent/engine eval:smoke
corepack pnpm --filter @keigent/engine eval:orchestrator
```

Also run a diff safety scan for hardcoded secrets and dangerous patterns.

## TDD task outline

### Task 1: CLI runOnce failure exitCode tests

**Files:**
- Create/modify: `packages/cli/src/__tests__/run-once.test.ts`
- Modify: `packages/cli/src/run-once.ts`

**Steps:**
1. Write failing tests for workflow non-success and thrown exception setting `process.exitCode = 1`.
2. Run targeted CLI test and confirm failure.
3. Add the minimal missing catch-path `process.exitCode = 1`.
4. Run targeted CLI tests and CLI check.

### Task 2: Adapter passes AbortSignal to engine

**Files:**
- Modify: `packages/engine/src/__tests__/workflow-engine-child-runner.test.ts`
- Modify: `packages/engine/src/workflow/engine-child-runner.ts`

**Steps:**
1. Add failing test that captures the seventh engine.run argument and asserts it contains the same signal passed to `runChild`.
2. Extend `EngineWorkflowRunner.run` with optional `{ signal?: AbortSignal }` argument.
3. Pass `options?.signal` through the adapter.
4. Run targeted engine adapter test.

### Task 3: LoopEngine accepts and respects AbortSignal

**Files:**
- Create: `packages/engine/src/__tests__/engine-abort.test.ts`
- Modify: `packages/engine/src/engine.ts`

**Steps:**
1. Write failing test: already-aborted signal exits without calling mocked `complete`.
2. Add `LoopEngineRunOptions`, abort helper, and abort checks.
3. Pass signal to `complete` options where type-compatible.
4. Add test: abort after LLM response before tool execution prevents tool execution.
5. Run targeted engine tests.

### Task 4: ToolRegistry cancellation boundary

**Files:**
- Create: `packages/engine/src/__tests__/tool-registry-abort.test.ts`
- Modify: `packages/engine/src/tools/types.ts`
- Modify: `packages/engine/src/tools/registry.ts`

**Steps:**
1. Write failing test: already-aborted signal means tool execute is not called.
2. Write failing test: signal abort during long-running tool causes registry to return promptly.
3. Add `signal?: AbortSignal` to `ToolContext`.
4. Update `ToolRegistry.execute()` timeout wrapper to also race abort signal and cleanup timers/listeners.
5. Run targeted registry tests.

### Task 5: Review and acceptance

**Steps:**
1. Run independent review focused on false-confidence, timeout, learning, exitCode, and side effects.
2. Fix blocking issues only.
3. Run full acceptance commands and safety scan.
4. Report exact evidence and remaining limitations.
