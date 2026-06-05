# Workflow Run Envelope & Evidence-Preserving Child Execution 实现方案

> **For Hermes:** Use `subagent-driven-development` skill to implement this plan task-by-task. This is a P0 infrastructure plan, not a product claim for full dynamic workflows.

**Goal:** 在不破坏 KeiGent 现有 `LoopEngine + LoopProfile` 架构的前提下，增加一个薄的 Workflow Run Envelope，让未来 child-run / verifier / fanout / quarantine 能建立在可追踪、可回放、可验收的事实源上。

**Architecture:** Workflow 层只做 parent envelope、mode selection、事件包装、预算/失败映射、workflow trajectory 持久化与 replay；每个 child run 仍然是现有 `LoopEngine.run()`。P0 不实现自由 JS workflow、fanout、tournament、worktree、动态 LLM planner、独立 verifier child、full quarantine 或 Web UI。

**Tech Stack:** TypeScript, pnpm monorepo, Vitest, existing `@keigent/engine` types, existing `LoopEngine`, `ProgressEvent`, `LoopResult`, `Trajectory`.

---

## 0. Scope Boundary

### P0 owns

- `packages/engine/src/workflow/*` 的纯类型、planner、runner、trajectory persistence/replay。
- Workflow-level parent result / event / trajectory。
- Sequential child-run execution envelope。
- Conservative `verified-loop`：只聚合已有 child checkpoint/verdict evidence，不新增 LLM verifier。
- Fake-driven tests；不调真实 LLM / browser / network。

### P0 does not own

- 不实现 Claude Code 风格自由 JS workflow 脚本。
- 不实现 fanout / synthesis / tournament / worktree。
- 不实现动态 LLM workflow planner。
- 不实现 recursive workflows。
- 不实现 full quarantine，只保留后续扩展位置；如果暴露 policy 字段，必须有 enforcement test。
- 不实现 token/cost budget；P0 budget 仅支持 child count / iterations / tool calls / timeout。
- 不声明任务质量提升；只声明 observability / replay / failure mapping 基础能力。

---

## 1. Core Semantics

### 1.1 ExecutionMode 与 LoopProfile 分离

`ExecutionMode` 只描述 workflow envelope：

```ts
export type ExecutionMode = "single-loop" | "verified-loop";
```

`LoopProfile` 仍由现有 orchestrator/profile 机制决定：

```ts
// examples only, actual type comes from existing engine types
"conversational" | "convergent-exec" | "convergent-verified" | "divergent-research"
```

**Rule:** `verified-loop !== convergent-verified`。Workflow planner 只选 mode，不替代 profile orchestrator。

### 1.2 Verified-loop P0 语义

P0 的 `verified-loop` 不新增 verifier。它只做 conservative enforcement：

- 如果 root task 没有 `successDef.assertions`，不应自动走 verified-loop。
- 如果 root task 有 assertions：
  - child `exitReason !== "success"` => workflow 不成功。
  - child success 但没有 passed checkpoint/verdict => `verified_failure`。
  - child success 且至少一个 required checkpoint/verdict passed => workflow success。

**禁止：**

- 从 worker final text 推断任务成功。
- 从 tool result 文本重新判定任务成功。
- 把 checkpoint count 当成功。
- 把 self-check 包装成 independent verification。

### 1.3 Sequential only

P0 child runs 必须顺序执行，不允许并发。原因：当前 `LoopEngine` 的 progress callback 存在 mutable instance field 风险；fanout 要等后续明确 engine instance/callback 隔离。

---

## 2. Files

### New files

```text
packages/engine/src/workflow/types.ts
packages/engine/src/workflow/planner.ts
packages/engine/src/workflow/runner.ts
packages/engine/src/workflow/trajectory.ts
packages/engine/src/workflow/index.ts
packages/engine/src/__tests__/workflow-planner.test.ts
packages/engine/src/__tests__/workflow-runner.test.ts
packages/engine/src/__tests__/workflow-trajectory.test.ts
```

### Modified files

```text
packages/engine/src/lib.ts
packages/engine/src/__tests__/public-api.test.ts
packages/engine/src/engine.ts                 # only if needed to preserve trajectory on failure paths
packages/engine/src/evals/replay.ts           # only if tool/checkpoint count consistency needs global fix
```

---

## 3. Type Design

### 3.1 `workflow/types.ts`

```ts
import type { ExitReason, LoopResult, ProgressEvent, Task, Trajectory } from "../types.js";
import type { PermissionLevel } from "../tools/types.js";

export type ExecutionMode = "single-loop" | "verified-loop";

export type WorkflowExitReason =
  | "success"
  | "verified_failure"
  | "budget_exceeded"
  | "timeout"
  | "child_error"
  | "child_escalated"
  | "max_iterations";

export type WorkflowChildRole = "worker" | "verifier";

export interface WorkflowBudget {
  maxChildRuns: number;
  maxIterationsPerRun: number;
  maxAggregateIterations?: number;
  maxAggregateToolCalls?: number;
  timeoutMs?: number;
}

export interface WorkflowPolicy {
  allowedProfiles?: string[];
  maxPermission?: PermissionLevel;
  requireApprovalForWrite?: boolean;
  quarantineUntrustedInput?: boolean; // reserved in P0 unless enforced by tests
}

export interface WorkflowVerificationPolicy {
  requirePassedCheckpoint?: boolean;
  minPassedCheckpoints?: number;
}

export interface WorkflowSpec {
  id: string;
  mode: ExecutionMode;
  goal: string;
  rootTask: Task;
  budget: WorkflowBudget;
  policy?: WorkflowPolicy;
  verification?: WorkflowVerificationPolicy;
}

export interface ChildRunSpec {
  id: string;
  role: WorkflowChildRole;
  task: Task;
  profile?: string;
  policy?: WorkflowPolicy;
}

export interface WorkflowBudgetUsage {
  childRuns: number;
  iterations: number;
  toolCalls: number;
  checkpointsPassed: number;
  durationMs: number;
}

export interface ChildRunResult {
  id: string;
  role: WorkflowChildRole;
  result: LoopResult;
  trajectory?: Trajectory;
}

export type WorkflowEvent =
  | { kind: "workflow_start"; workflowId: string; mode: ExecutionMode; goal: string }
  | { kind: "child_start"; workflowId: string; childRunId: string; role: WorkflowChildRole }
  | { kind: "child_event"; workflowId: string; childRunId: string; event: ProgressEvent }
  | { kind: "child_done"; workflowId: string; childRunId: string; exitReason: ExitReason }
  | { kind: "workflow_verdict"; workflowId: string; passed: boolean; evidence: WorkflowEvidence[] }
  | { kind: "workflow_done"; workflowId: string; exitReason: WorkflowExitReason };

export type WorkflowProgressCallback = (event: WorkflowEvent) => void;

export interface WorkflowEvidence {
  kind: "checkpoint" | "policy" | "budget" | "child_result";
  passed: boolean;
  message: string;
  sourceChildRunId?: string;
  assertion?: string;
}

export interface WorkflowResult {
  workflowId: string;
  mode: ExecutionMode;
  exitReason: WorkflowExitReason;
  finalResponse: string;
  childRuns: ChildRunResult[];
  evidence: WorkflowEvidence[];
  budget: WorkflowBudget;
  budgetUsage: WorkflowBudgetUsage;
  durationMs: number;
  trajectory: WorkflowTrajectory;
}

export interface WorkflowTrajectory {
  schemaVersion: 1;
  workflowId: string;
  mode: ExecutionMode;
  goal: string;
  rootTask: Task;
  startedAt: string;
  durationMs: number;
  exitReason: WorkflowExitReason;
  finalResponse: string;
  budget: WorkflowBudget;
  budgetUsage: WorkflowBudgetUsage;
  evidence: WorkflowEvidence[];
  events: WorkflowEvent[];
  childRuns: Array<{
    id: string;
    role: WorkflowChildRole;
    result: LoopResult;
    trajectory?: Trajectory;
  }>;
}
```

**Notes:**

- `WorkflowEvent` wraps `ProgressEvent`; do not duplicate child event variants.
- `WorkflowTrajectory` embeds child `Trajectory` unchanged.
- `WorkflowEvidence` is structured; do not rely only on arbitrary strings.

---

## 4. Planner Design

### `workflow/planner.ts`

```ts
import type { Task } from "../types.js";
import type { ExecutionMode, WorkflowBudget, WorkflowSpec } from "./types.js";

export const DEFAULT_WORKFLOW_BUDGET: WorkflowBudget = {
  maxChildRuns: 1,
  maxIterationsPerRun: 10,
  maxAggregateIterations: 10,
  maxAggregateToolCalls: 20,
  timeoutMs: 120_000,
};

export function chooseExecutionMode(task: Task): ExecutionMode {
  return task.successDef?.assertions?.length ? "verified-loop" : "single-loop";
}

export function createWorkflowSpec(input: {
  id: string;
  task: Task;
  mode?: ExecutionMode;
  budget?: Partial<WorkflowBudget>;
}): WorkflowSpec {
  const mode = input.mode ?? chooseExecutionMode(input.task);
  return {
    id: input.id,
    mode,
    goal: input.task.goal,
    rootTask: input.task,
    budget: { ...DEFAULT_WORKFLOW_BUDGET, ...input.budget },
    verification: mode === "verified-loop"
      ? { requirePassedCheckpoint: true, minPassedCheckpoints: 1 }
      : undefined,
  };
}
```

**Rule:** Planner does not select profile. Profile selection remains existing orchestrator/engine responsibility.

---

## 5. Runner Design

### 5.1 Child runner interface

`WorkflowRunner` should be testable without real LLM:

```ts
export interface WorkflowChildRunner {
  runChild(
    child: ChildRunSpec,
    options?: { onProgress?: (event: ProgressEvent) => void; maxIterations?: number }
  ): Promise<LoopResult>;
}
```

### 5.2 Runner behavior

`workflow/runner.ts` responsibilities:

1. Validate budget before running.
2. Emit `workflow_start`.
3. Build one worker `ChildRunSpec`.
4. Emit `child_start`.
5. Call injected `childRunner.runChild(...)` sequentially.
6. Wrap child `ProgressEvent` as `child_event`.
7. Emit `child_done`.
8. Compute budget usage.
9. Map child exit reason + verification policy to workflow exit reason.
10. Emit `workflow_verdict` for verified-loop.
11. Build `WorkflowTrajectory`.
12. Emit exactly one `workflow_done`.
13. Return `WorkflowResult`.

### 5.3 Failure mapping

| Child `exitReason` | Workflow exit |
|---|---|
| `success` + non-verified mode | `success` |
| `success` + verified evidence passed | `success` |
| `success` + verified evidence missing/failed | `verified_failure` |
| `error` | `child_error` |
| `max_iterations` | `max_iterations` |
| `escalated` | `child_escalated` |
| child throws | `child_error` |
| timeout | `timeout` |
| budget exceeded | `budget_exceeded` |

### 5.4 Conservative verification check

Helper:

```ts
function collectPassedCheckpointEvidence(child: ChildRunResult): WorkflowEvidence[] {
  const steps = child.trajectory?.steps ?? [];
  const checkpointSteps = steps.filter((step) => step.kind === "checkpoint");
  return checkpointSteps.map((step) => ({
    kind: "checkpoint",
    passed: step.verdictPassed === true,
    message: step.verdictEvidence ?? "checkpoint verdict missing",
    sourceChildRunId: child.id,
  }));
}
```

If root task has assertions and no `passed: true` checkpoint evidence exists, result is `verified_failure`.

---

## 6. Trajectory Persistence / Replay

### `workflow/trajectory.ts`

Functions:

```ts
export async function saveWorkflowTrajectory(
  trajectory: WorkflowTrajectory,
  options?: { dir?: string }
): Promise<string>;

export async function loadWorkflowTrajectory(path: string): Promise<WorkflowTrajectory>;

export function replayWorkflowTrajectory(trajectory: WorkflowTrajectory): WorkflowResult;
```

Rules:

- Persist under `.trajectories/workflows/` by default.
- Replay must not call child runner, LLM, browser, network, or tools.
- Replay reconstructs the same `WorkflowResult` fields from saved trajectory.
- Replay result must be labeled/reported as replayed by callers if surfaced later; replay is not correctness verification.

---

## 7. Pre-work Engine Fixes

Before or alongside P0, inspect and fix if necessary:

### 7.1 Preserve trajectory on failure paths

`packages/engine/src/engine.ts` should preserve collector/trajectory for:

- `max_iterations`
- model/LLM error
- child/tool error if applicable

Acceptance:

- A failed `LoopResult` still contains trajectory steps already collected.
- Error step/evidence is recorded where possible.

### 7.2 Clarify tool-call vs checkpoint counts

Define P0 metrics:

- `toolCalls`: normal tool_call steps only。
- `checkpointsPassed`: existing checkpoint pass count。
- `verificationRequests`: optional future metric, not required in P0。

Acceptance:

- Live `LoopResult` and replay result use the same definition, or docs explicitly separate live-only metric from replay metric.
- Workflow budget docs specify whether checkpoints count against `maxAggregateToolCalls`。Recommended P0: **no**, checkpoint count is separate.

---

## 8. Test Plan

All tests use Vitest and fake child runners unless explicitly testing existing engine compatibility. No real LLM/API/network/browser calls.

### 8.1 Planner tests

File: `packages/engine/src/__tests__/workflow-planner.test.ts`

Cases:

1. `chooseExecutionMode` returns `single-loop` when task has no `successDef`。
2. `chooseExecutionMode` returns `verified-loop` when task has `successDef.assertions`。
3. Explicit mode override is respected in `createWorkflowSpec`。
4. Default budget is applied。
5. Partial budget override merges with defaults。
6. Planner does not mutate input task。

### 8.2 Runner happy-path tests

File: `packages/engine/src/__tests__/workflow-runner.test.ts`

Cases:

1. `single-loop` emits ordered events:
   - `workflow_start`
   - `child_start`
   - `child_event*`
   - `child_done`
   - `workflow_done`
2. `single-loop` starts exactly one child。
3. Wrapped child events preserve original `ProgressEvent` object/content。
4. Child trajectory is embedded unchanged。
5. Final response equals child final response。
6. Budget usage aggregates child iterations/tool calls/checkpoints。

### 8.3 Failure mapping tests

Cases:

1. child `error` -> `child_error`。
2. child `max_iterations` -> `max_iterations`。
3. child `escalated` -> `child_escalated`。
4. child runner throws -> `child_error` and still emits exactly one `workflow_done`。
5. child failure still appears in `childRuns` and trajectory。

### 8.4 Verified-loop conservative tests

Cases:

1. assertions + child success + passed checkpoint -> workflow `success`。
2. assertions + child success + no checkpoint -> `verified_failure`。
3. assertions + child success + failed checkpoint -> `verified_failure`。
4. assertions + child success + checkpoint with missing verdict -> `verified_failure`。
5. `workflow_verdict` event includes structured evidence。
6. Test proves no real `AdversarialJudge` / LLM verifier is instantiated in workflow tests。

### 8.5 Budget tests

Cases:

1. `maxChildRuns: 0` rejects before child runner is called -> `budget_exceeded`。
2. child iterations exceed aggregate budget -> `budget_exceeded`。
3. child tool calls exceed aggregate budget -> `budget_exceeded`。
4. timeout -> `timeout`。
5. Budget failure emits exactly one terminal `workflow_done`。
6. Checkpoint count is not counted as normal toolCalls if that is P0 policy。

### 8.6 Event invariant tests

Cases:

1. Every `child_start` has exactly one matching `child_done`。
2. Every workflow has exactly one `workflow_start` and one `workflow_done`。
3. `workflow_done` is last event。
4. No raw child `ProgressEvent` is emitted as a top-level workflow event。
5. Event order remains stable across success and failure。

### 8.7 Trajectory persistence/replay tests

File: `packages/engine/src/__tests__/workflow-trajectory.test.ts`

Cases:

1. `saveWorkflowTrajectory` writes valid JSON。
2. `loadWorkflowTrajectory` returns same workflow id/mode/exit reason。
3. `replayWorkflowTrajectory` reconstructs same aggregate result。
4. Replay does not call child runner。
5. Failed child result and trajectory are preserved。
6. Child `Trajectory` shape is not flattened or rewritten。

### 8.8 Public API tests

Modify: `packages/engine/src/__tests__/public-api.test.ts`

Cases:

1. `ExecutionMode`, `WorkflowRunner`, planner helpers, trajectory helpers are importable from `../lib.js` or agreed public entry。
2. Existing public exports remain available。

---

## 9. Acceptance Standards

### 9.1 Functional acceptance

- P0 can wrap a fake child `LoopResult` into a `WorkflowResult`。
- P0 can emit complete ordered workflow events。
- P0 can persist and replay workflow trajectory without live dependencies。
- P0 can mark child-success-but-no-evidence as `verified_failure` for assertion tasks。
- P0 can map all child exit reasons deterministically。

### 9.2 Architecture acceptance

- `WorkflowRunner` does not call LLM directly。
- `WorkflowRunner` does not execute tools directly。
- `WorkflowRunner` does not implement its own agent loop。
- `WorkflowRunner` does not replace profile orchestrator。
- Child `Trajectory` is embedded unchanged。
- `ProgressEvent` is wrapped, not redefined/flattened。
- P0 child execution is sequential only。

### 9.3 Safety / false-confidence acceptance

- No docs/release notes claim better task success rate。
- `verified-loop` docs explicitly state P0 verification is checkpoint/assertion enforcement, not independent verification。
- Tests include at least one false-success prevention case。
- Policy fields are either enforced with tests or marked reserved and not used for user-visible claims。
- Replay is labeled as replay/infrastructure, not quality proof。

### 9.4 Test acceptance commands

Run from repo root:

```bash
corepack pnpm --filter @keigent/engine check
corepack pnpm --filter @keigent/engine test --run
```

Expected:

- Typecheck passes。
- Existing engine tests remain passing。
- New workflow tests pass。
- No test requires `KEIGENT_API_KEY`。
- No workflow test calls real LLM/network/browser。

Optional broader verification after P0:

```bash
corepack pnpm --filter @keigent/cli exec tsc --noEmit
corepack pnpm --filter @keigent/web exec tsc --noEmit
```

---

## 10. Implementation Tasks

### Task 1: Fix/verify failure trajectory preservation

**Objective:** Ensure failed loop results keep collected trajectory evidence.

**Files:**

- Inspect/modify: `packages/engine/src/engine.ts`
- Test: existing or new engine failure test if practical。

**Steps:**

1. Add/adjust test proving a max-iterations or error result preserves trajectory。
2. Run targeted test; verify it fails if current code drops trajectory。
3. Patch `LoopEngine` result construction to include collector where possible。
4. Run targeted test and full engine tests。

### Task 2: Clarify count semantics

**Objective:** Make P0 workflow budget metrics non-deceptive。

**Files:**

- Inspect/modify: `packages/engine/src/trajectory.ts`
- Inspect/modify: `packages/engine/src/evals/replay.ts`
- New workflow tests later depend on this。

**Steps:**

1. Define normal `toolCalls` as `tool_call` steps only。
2. Keep checkpoint pass count separate。
3. If live/replay mismatch exists, fix or document and avoid using mismatched metric in workflow budget。
4. Add regression test if a code change is required。

### Task 3: Add workflow types

**Objective:** Create stable P0 type surface。

**Files:**

- Create: `packages/engine/src/workflow/types.ts`
- Create: `packages/engine/src/workflow/index.ts`

**Steps:**

1. Write types from §3。
2. Export from `workflow/index.ts`。
3. Run `corepack pnpm --filter @keigent/engine check`。

### Task 4: Add deterministic planner

**Objective:** Select workflow mode without replacing profile orchestrator。

**Files:**

- Create: `packages/engine/src/workflow/planner.ts`
- Test: `packages/engine/src/__tests__/workflow-planner.test.ts`

**Steps:**

1. Write failing planner tests。
2. Implement `DEFAULT_WORKFLOW_BUDGET`, `chooseExecutionMode`, `createWorkflowSpec`。
3. Run planner tests。

### Task 5: Add WorkflowRunner with fake child runner tests

**Objective:** Implement sequential one-child envelope。

**Files:**

- Create: `packages/engine/src/workflow/runner.ts`
- Test: `packages/engine/src/__tests__/workflow-runner.test.ts`

**Steps:**

1. Write fake `WorkflowChildRunner`。
2. Add event-order success test。
3. Implement runner minimal success path。
4. Add failure mapping tests。
5. Add verified-loop conservative tests。
6. Add budget tests。
7. Run workflow runner tests。

### Task 6: Add workflow trajectory persistence/replay

**Objective:** Persist and replay workflow facts without live dependencies。

**Files:**

- Create: `packages/engine/src/workflow/trajectory.ts`
- Test: `packages/engine/src/__tests__/workflow-trajectory.test.ts`

**Steps:**

1. Write save/load/replay tests。
2. Implement JSON persistence。
3. Implement replay from saved trajectory。
4. Verify replay does not call child runner。

### Task 7: Public exports and final verification

**Objective:** Make P0 usable through engine public API without breaking existing exports。

**Files:**

- Modify: `packages/engine/src/lib.ts`
- Modify: `packages/engine/src/__tests__/public-api.test.ts`

**Steps:**

1. Export minimal workflow API。
2. Add import smoke tests。
3. Run:

```bash
corepack pnpm --filter @keigent/engine check
corepack pnpm --filter @keigent/engine test --run
```

4. Review diff for false-confidence language。

---

## 11. Non-goal Regression Checklist

Before merging, confirm none of these were accidentally added:

- [ ] No free-form JS workflow execution。
- [ ] No fanout / parallel child runs。
- [ ] No tournament ranking。
- [ ] No git worktree provider。
- [ ] No dynamic LLM planner。
- [ ] No real verifier LLM inside workflow tests。
- [ ] No memory writes from workflow layer。
- [ ] No second approval system。
- [ ] No Web dashboard changes claiming workflow success。
- [ ] No user-facing claim that P0 improves task quality。

---

## 12. Final Merge Gate

P0 is mergeable only if:

1. All engine typecheck/tests pass。
2. Workflow tests are fake-driven and deterministic。
3. Failed child trajectories are preserved。
4. Verified-loop cannot pass without passed checkpoint evidence when assertions exist。
5. Workflow trajectory replay works offline。
6. Event order and terminal event invariants are tested。
7. Public API test covers workflow exports。
8. Documentation honestly states P0 is infrastructure, not full dynamic workflows。
