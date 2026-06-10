import type { Task } from "../types.js";
import type { ExecutionMode, WorkflowBudget, WorkflowPolicy, WorkflowSpec, WorkflowVerificationPolicy } from "./types.js";

export const DEFAULT_WORKFLOW_BUDGET: WorkflowBudget = {
  maxChildRuns: 1,
  maxIterationsPerRun: 10,
  maxAggregateIterations: 10,
  maxToolCallsPerRun: 20,
  maxAggregateToolCalls: 20,
  maxTokenEstimatePerRun: 64_000,
  maxAggregateTokenEstimate: 64_000,
  maxRecoveryAttemptsPerRun: 3,
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
  policy?: WorkflowPolicy;
  verification?: WorkflowVerificationPolicy;
}): WorkflowSpec {
  const mode = input.mode ?? chooseExecutionMode(input.task);
  if (mode === "reviewed-loop" && !input.task.successDef?.assertions?.length) {
    throw new Error("reviewed-loop requires successDef assertions");
  }
  const defaultBudget = mode === "reviewed-loop"
    ? { ...DEFAULT_WORKFLOW_BUDGET, maxChildRuns: 2, maxAggregateIterations: 20, maxAggregateToolCalls: 40 }
    : DEFAULT_WORKFLOW_BUDGET;
  const budget = { ...defaultBudget, ...input.budget };
  if (mode === "reviewed-loop" && budget.maxChildRuns < 2) {
    throw new Error("reviewed-loop requires budget.maxChildRuns >= 2");
  }
  const policy = mode === "reviewed-loop"
    ? { ...input.policy, verifierReadonly: true, allowExternalSideEffects: false }
    : input.policy;

  return {
    id: input.id,
    mode,
    goal: input.task.goal,
    rootTask: input.task,
    budget,
    policy,
    verification:
      mode === "verified-loop"
        ? { requirePassedCheckpoint: true, minPassedCheckpoints: 1, ...input.verification }
        : undefined,
  };
}
