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
  /** P0 reserved: policy is attached to ChildRunSpec for downstream child runners; WorkflowRunner itself does not enforce it yet. */
  allowedProfiles?: string[];
  /** P0 reserved: policy is attached to ChildRunSpec for downstream child runners; WorkflowRunner itself does not enforce it yet. */
  maxPermission?: PermissionLevel;
  /** P0 reserved: policy is attached to ChildRunSpec for downstream child runners; WorkflowRunner itself does not enforce it yet. */
  requireApprovalForWrite?: boolean;
  /** P0 reserved: quarantine mode is not implemented in this envelope. */
  quarantineUntrustedInput?: boolean;
}

export interface WorkflowVerificationPolicy {
  /** P0 reserved: verified-loop always requires at least one passed checkpoint. */
  requirePassedCheckpoint?: boolean;
  /** P0 supports this count, defaulting to 1 and clamping lower values to 1. */
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
