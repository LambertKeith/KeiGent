import type { Task } from "../types.js";
import type { ExecutionMode, WorkflowBudget, WorkflowSpec, WorkflowVerificationPolicy } from "./types.js";

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
  verification?: WorkflowVerificationPolicy;
}): WorkflowSpec {
  const mode = input.mode ?? chooseExecutionMode(input.task);

  return {
    id: input.id,
    mode,
    goal: input.task.goal,
    rootTask: input.task,
    budget: { ...DEFAULT_WORKFLOW_BUDGET, ...input.budget },
    verification:
      mode === "verified-loop"
        ? { requirePassedCheckpoint: true, minPassedCheckpoints: 1, ...input.verification }
        : undefined,
  };
}
