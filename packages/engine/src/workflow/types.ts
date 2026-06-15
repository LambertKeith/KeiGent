import type { ExitReason, LoopResult, ProgressEvent, ProviderUsageSummary, Task, Trajectory } from "../types.js";
import type { FailureSummary } from "../failures.js";
import type { PermissionLevel, RiskLevel } from "../tools/types.js";

export type ExecutionMode = "single-loop" | "verified-loop" | "reviewed-loop";

export type WorkflowExitReason =
  | "success"
  | "verified_failure"
  | "budget_exceeded"
  | "timeout"
  | "child_error"
  | "child_escalated"
  | "max_iterations";

export type WorkflowChildRole = "worker" | "reviewer" | "verifier";

export type EscalationReason =
  | "permission_required"
  | "risk_confirmation_required"
  | "goal_ambiguity_blocking"
  | "evidence_insufficient_after_retry"
  | "acceptance_failed_after_repair"
  | "budget_exhausted"
  | "external_dependency_blocked";

export type AutonomyOutcome =
  | "completed_without_escalation"
  | "self_repaired"
  | "degraded_without_escalation"
  | "escalated";

export interface RepairAttemptSummary {
  targetAssertion: string;
  reason: string;
  attempt: number;
  finalVerdict: "passed" | "failed" | "budget_exhausted";
}

export interface EscalationDecision {
  reason: EscalationReason;
  message: string;
}

export interface AutonomySummary {
  outcome: AutonomyOutcome;
  repairAttempts: RepairAttemptSummary[];
  escalations: EscalationDecision[];
}

export interface WorkflowBudget {
  maxChildRuns: number;
  maxIterationsPerRun: number;
  maxAggregateIterations?: number;
  maxToolCallsPerRun?: number;
  maxAggregateToolCalls?: number;
  maxTokenEstimatePerRun?: number;
  maxAggregateTokenEstimate?: number;
  maxProviderCostUsdPerRun?: number;
  maxAggregateProviderCostUsd?: number;
  maxRecoveryAttemptsPerRun?: number;
  timeoutMs?: number;
}

export interface WorkflowPolicy {
  /** Optional profile allow-list for child selection. */
  allowedProfiles?: string[];
  /** Maximum tool permission exposed to child runs. */
  maxPermission?: PermissionLevel;
  /** Maximum tool risk exposed to child runs. */
  maxRiskLevel?: RiskLevel;
  /** Whether child runs may use tools with external side effects. Defaults to true. */
  allowExternalSideEffects?: boolean;
  /** Parent-approved resource scopes that may be inherited by child execution. */
  approvalScopes?: string[];
  /** Force verifier children to readonly/no-side-effect tools. */
  verifierReadonly?: boolean;
  /** P0 compatibility flag retained for existing callers. */
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

export interface ReviewRubric {
  taskGoal: string;
  successCriteria: string[];
  requiredEvidence: string[];
  forbiddenClaims: string[];
  falseConfidenceRisks: string[];
  blockingIssueRules: string[];
}

export interface ReviewIssue {
  severity: "blocking" | "non_blocking";
  sourceChildRunId: string;
  message: string;
  evidenceKind: WorkflowEvidence["kind"];
  assertion?: string;
}

export interface ReviewSummary {
  reviewerRunId: string;
  rubric: ReviewRubric;
  issues: ReviewIssue[];
}

export type ChildWorkspaceStatus = "active" | "abandoned";
export type ChildWorkspaceCleanupMode = "remove" | "mark_abandoned";
export type ChildWorkspaceArtifactKind = "generated_file" | "diff" | "log_excerpt";

export interface ChildWorkspaceArtifact {
  kind: ChildWorkspaceArtifactKind;
  path: string;
  relativePath: string;
  sizeBytes: number;
}

export interface ChildWorkspaceConflict {
  relativePath: string;
  workspaceIds: string[];
  childRunIds: string[];
}

export interface ChildWorkspaceSummary {
  workspaceId: string;
  branchName?: string;
  workspacePath?: string;
  manifestPath?: string;
  status: ChildWorkspaceStatus;
  cleanupMode?: ChildWorkspaceCleanupMode;
  abandonedReason?: string;
  artifacts: ChildWorkspaceArtifact[];
  conflicts: ChildWorkspaceConflict[];
}

export interface WorkflowWorkspaceIsolation {
  rootDir: string;
  cleanupMode?: ChildWorkspaceCleanupMode;
}

export interface WorkflowReviewPolicy {
  rubric: ReviewRubric;
}

export interface WorkflowSpec {
  id: string;
  mode: ExecutionMode;
  goal: string;
  rootTask: Task;
  budget: WorkflowBudget;
  policy?: WorkflowPolicy;
  verification?: WorkflowVerificationPolicy;
  review?: WorkflowReviewPolicy;
  workspaceIsolation?: WorkflowWorkspaceIsolation;
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
  tokenEstimate?: number;
  providerUsage?: ProviderUsageSummary;
  recoveryAttempts: number;
  checkpointsPassed: number;
  durationMs: number;
}

export interface ChildRunResult {
  id: string;
  role: WorkflowChildRole;
  result: LoopResult;
  trajectory?: Trajectory;
  workspace?: ChildWorkspaceSummary;
}

export type WorkflowEvent =
  | { kind: "workflow_start"; workflowId: string; mode: ExecutionMode; goal: string }
  | { kind: "child_start"; workflowId: string; childRunId: string; role: WorkflowChildRole }
  | { kind: "child_event"; workflowId: string; childRunId: string; event: ProgressEvent }
  | { kind: "child_done"; workflowId: string; childRunId: string; exitReason: ExitReason }
  | { kind: "workflow_verdict"; workflowId: string; passed: boolean; evidence: WorkflowEvidence[] }
  | { kind: "workflow_done"; workflowId: string; exitReason: WorkflowExitReason; failure?: FailureSummary };

export type WorkflowProgressCallback = (event: WorkflowEvent) => void;

export interface WorkflowEvidence {
  kind: "checkpoint" | "assertion" | "policy" | "budget" | "child_result";
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
  autonomy: AutonomySummary;
  evidence: WorkflowEvidence[];
  review?: ReviewSummary;
  failure?: FailureSummary;
  events: WorkflowEvent[];
  childRuns: Array<{
    id: string;
    role: WorkflowChildRole;
    result: LoopResult;
    trajectory?: Trajectory;
    workspace?: ChildWorkspaceSummary;
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
  autonomy: AutonomySummary;
  review?: ReviewSummary;
  durationMs: number;
  trajectory: WorkflowTrajectory;
  failure?: FailureSummary;
}
