import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FailureSummary } from "./failures.js";
import type { ApprovalDecision, PermissionLevel, RiskLevel, SideEffect } from "./tools/types.js";
import type { SkillMatchExplanation, Task, Trajectory, TrajectoryStep } from "./types.js";
import type { WorkflowEvidence, WorkflowEvent, WorkflowExitReason, WorkflowResult } from "./workflow/types.js";

export type RunStatus =
  | "created"
  | "routed"
  | "running"
  | "awaiting_approval"
  | "verifying"
  | "succeeded"
  | "failed"
  | "degraded"
  | "cancelled";

export type RunTaskSource = "cli" | "web" | "eval" | "replay" | "unknown";
export type RunEvidenceStatus = "passed" | "failed" | "not_checked" | "insufficient_evidence";

export interface RunTaskSnapshot {
  goal: string;
  source: RunTaskSource;
  requestedProfile?: string;
  resolvedProfile?: string;
  requestedWorkflowMode?: string;
  resolvedWorkflowMode?: string;
  successDef?: {
    goal: string;
    assertionCount: number;
  };
}

export interface RouteDecisionSnapshot {
  selectedProfile?: string;
  source: "explicit" | "rule" | "skill-match" | "llm" | "guard" | "unknown";
  ruleId?: string;
  rationale?: string;
  guardApplied?: boolean;
  unguardedProfile?: string;
  matchedSkillIds: string[];
}

export interface WorkflowSnapshot {
  id: string;
  mode: string;
  exitReason: WorkflowExitReason;
  childRuns: number;
  budgetUsage: WorkflowResult["budgetUsage"];
}

export interface ExecutionSummary {
  iterations: number;
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  checkpointCount: number;
  passedCheckpoints: number;
  durationMs: number;
  exitReason: string;
  finalResponseSummary: string;
  eventCounts: Record<string, number>;
}

export interface EvidenceSummary {
  status: RunEvidenceStatus;
  total: number;
  passed: number;
  failed: number;
  sources: string[];
  blocking: string[];
}

export interface RiskSummary {
  highestRiskLevel: RiskLevel | "R0";
  permissionClassesUsed: PermissionLevel[];
  sideEffectsAttempted: number;
  sideEffectsSucceeded: number;
  externalSideEffects: number;
  irreversibleActions: number;
  approvalRequired: boolean;
}

export interface ApprovalSummary {
  toolName: string;
  approved: boolean;
  decidedAt: string;
  riskLevel: RiskLevel;
  permission: PermissionLevel;
  sideEffect: SideEffect;
  reversible: boolean;
  targetResource: string;
}

export interface RunArtifact {
  kind: "trajectory" | "workflow_trajectory" | "record" | "replay_report";
  path: string;
}

export interface ReplayCapability {
  supported: boolean;
  unsupportedReason?: string;
  trajectoryPath?: string;
  trajectorySchemaVersion?: number;
  latestReplayReportId?: string;
  freshExecution: boolean;
}

export interface RedactionSummary {
  applied: boolean;
  rawPayloadStored: boolean;
}

export interface RunRecord {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  task: RunTaskSnapshot;
  route: RouteDecisionSnapshot;
  workflow?: WorkflowSnapshot;
  execution: ExecutionSummary;
  evidence: EvidenceSummary;
  risk: RiskSummary;
  approvals: ApprovalSummary[];
  failures: FailureSummary[];
  artifacts: RunArtifact[];
  replay: ReplayCapability;
  redaction: RedactionSummary;
}

export interface BuildRunRecordOptions {
  id?: string;
  createdAt?: string;
  taskSource?: RunTaskSource;
  trajectoryPath?: string;
  workflowTrajectoryPath?: string;
  replay?: Partial<ReplayCapability>;
}

export interface SaveRunRecordOptions {
  runsDir: string;
}

export function buildRunRecordFromWorkflowResult(
  result: WorkflowResult,
  options: BuildRunRecordOptions = {},
): RunRecord {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const worker = result.childRuns.find((child) => child.role === "worker") ?? result.childRuns[0];
  const workerResult = worker?.result;
  const trajectory = worker?.trajectory ?? workerResult?.trajectory;
  const task = result.trajectory.rootTask ?? trajectory?.task;
  const approvals = collectApprovals(result);
  const evidence = summarizeEvidence(result.evidence, result.exitReason);
  const artifacts = buildArtifacts(options);
  const route = summarizeRoute(result.trajectory.events, trajectory);

  return {
    schemaVersion: 1,
    id: options.id ?? makeRunId(createdAt),
    createdAt,
    updatedAt: createdAt,
    status: statusForWorkflowExit(result.exitReason),
    task: summarizeTask(task, result, trajectory, options.taskSource ?? "unknown"),
    route,
    workflow: {
      id: result.workflowId,
      mode: result.mode,
      exitReason: result.exitReason,
      childRuns: result.childRuns.length,
      budgetUsage: result.budgetUsage,
    },
    execution: summarizeExecution(result, trajectory),
    evidence,
    risk: summarizeRisk(approvals),
    approvals: approvals.map(summarizeApproval),
    failures: collectFailures(result),
    artifacts,
    replay: {
      supported: true,
      trajectoryPath: options.workflowTrajectoryPath ?? options.trajectoryPath,
      trajectorySchemaVersion: result.trajectory.schemaVersion,
      freshExecution: true,
      ...options.replay,
    },
    redaction: { applied: true, rawPayloadStored: false },
  };
}

export async function saveRunRecord(record: RunRecord, options: SaveRunRecordOptions): Promise<string> {
  const dir = join(options.runsDir, record.id);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "record.json");
  if (!record.artifacts.some((artifact) => artifact.kind === "record" && artifact.path === path)) {
    record.artifacts.push({ kind: "record", path });
  }
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return path;
}

export function summarizeRunRecord(record: RunRecord): string {
  const skills = record.route.matchedSkillIds.length ? record.route.matchedSkillIds.join(", ") : "none";
  const trajectory = record.replay.trajectoryPath ?? "not saved";
  const replay = record.replay.trajectoryPath ? `keigent replay ${record.replay.trajectoryPath}` : "unsupported";
  const lines = [
    `Run: ${record.id}`,
    `Status: ${record.status}`,
    `Profile: ${record.task.resolvedProfile ?? record.route.selectedProfile ?? "unknown"}`,
    `Workflow: ${record.task.resolvedWorkflowMode ?? "unknown"}`,
    `Skills: ${skills}`,
    `Tools: ${record.execution.successfulToolCalls} succeeded / ${record.execution.failedToolCalls} failed`,
    `Evidence: ${record.evidence.passed} passed / ${record.evidence.failed} failed`,
    `Risk: ${record.risk.highestRiskLevel}${record.risk.approvalRequired ? " approval-required" : ""}`,
    `Trajectory: ${trajectory}`,
    `Replay: ${replay}`,
  ];
  if (record.status === "failed" || record.status === "cancelled") {
    const failure = record.failures[0]?.code ?? record.workflow?.exitReason ?? record.execution.exitReason;
    lines.splice(2, 0, `Failure: ${failure}`);
    if (record.evidence.blocking[0]) lines.splice(3, 0, `Blocking evidence: ${record.evidence.blocking[0]}`);
  }
  return lines.join("\n");
}

function makeRunId(createdAt: string): string {
  return `run_${createdAt.replace(/\D/g, "").slice(0, 14)}`;
}

function summarizeTask(
  task: Task | undefined,
  result: WorkflowResult,
  trajectory: Trajectory | undefined,
  source: RunTaskSource,
): RunTaskSnapshot {
  return {
    goal: task?.goal ?? result.finalResponse,
    source,
    requestedProfile: task?.profile,
    resolvedProfile: trajectory?.profile,
    requestedWorkflowMode: result.mode,
    resolvedWorkflowMode: result.mode,
    ...(task?.successDef
      ? { successDef: { goal: task.successDef.goal, assertionCount: task.successDef.assertions.length } }
      : {}),
  };
}

function summarizeRoute(events: WorkflowEvent[], trajectory?: Trajectory): RouteDecisionSnapshot {
  const profileEvent = events
    .map((event) => event.kind === "child_event" && event.event.kind === "profile_selected" ? event.event : null)
    .find((event) => event !== null);
  const matchedSkillIds = trajectory?.skillsUsed ?? [];
  const via = profileEvent?.via;
  return {
    selectedProfile: profileEvent?.profile ?? trajectory?.profile,
    source: profileEvent?.guardApplied ? "guard" : via === "rule" ? "rule" : via === "llm" ? "llm" : "unknown",
    ruleId: profileEvent?.ruleId,
    rationale: profileEvent?.rationale,
    guardApplied: profileEvent?.guardApplied,
    unguardedProfile: profileEvent?.unguardedProfile,
    matchedSkillIds,
  };
}

function summarizeExecution(result: WorkflowResult, trajectory?: Trajectory): ExecutionSummary {
  const steps = result.childRuns.flatMap((child) => child.trajectory?.steps ?? child.result.trajectory.steps);
  const toolSteps = steps.filter((step) => step.kind === "tool_call");
  const checkpointSteps = steps.filter((step) => step.kind === "checkpoint");
  return {
    iterations: result.budgetUsage.iterations,
    totalToolCalls: result.budgetUsage.toolCalls,
    successfulToolCalls: toolSteps.filter((step) => step.toolSucceeded).length,
    failedToolCalls: toolSteps.filter((step) => step.toolSucceeded === false).length,
    checkpointCount: checkpointSteps.length,
    passedCheckpoints: checkpointSteps.filter((step) => step.verdictPassed).length,
    durationMs: result.durationMs,
    exitReason: result.exitReason,
    finalResponseSummary: oneLine(result.finalResponse, 240),
    eventCounts: countEvents(result.trajectory.events, steps),
  };
}

function summarizeEvidence(evidence: WorkflowEvidence[], exitReason: WorkflowExitReason): EvidenceSummary {
  const total = evidence.length;
  const passed = evidence.filter((item) => item.passed).length;
  const failed = evidence.filter((item) => !item.passed).length;
  const status: RunEvidenceStatus = total === 0
    ? exitReason === "success" ? "not_checked" : "insufficient_evidence"
    : failed > 0 ? "failed" : "passed";
  return {
    status,
    total,
    passed,
    failed,
    sources: [...new Set(evidence.map((item) => item.kind))],
    blocking: evidence.filter((item) => !item.passed).map((item) => item.message),
  };
}

function summarizeRisk(approvals: ApprovalDecision[]): RiskSummary {
  const permissionClassesUsed = [...new Set(approvals.map((approval) => approval.request.permission))];
  const sideEffectApprovals = approvals.filter((approval) => approval.request.sideEffect !== "none");
  return {
    highestRiskLevel: highestRisk(approvals.map((approval) => approval.request.riskLevel)),
    permissionClassesUsed,
    sideEffectsAttempted: sideEffectApprovals.length,
    sideEffectsSucceeded: sideEffectApprovals.filter((approval) => approval.approved).length,
    externalSideEffects: approvals.filter((approval) => approval.request.sideEffect === "external").length,
    irreversibleActions: approvals.filter((approval) => !approval.request.reversible).length,
    approvalRequired: approvals.length > 0,
  };
}

function summarizeApproval(approval: ApprovalDecision): ApprovalSummary {
  return {
    toolName: approval.request.toolName,
    approved: approval.approved,
    decidedAt: approval.decidedAt,
    riskLevel: approval.request.riskLevel,
    permission: approval.request.permission,
    sideEffect: approval.request.sideEffect,
    reversible: approval.request.reversible,
    targetResource: approval.request.targetResource,
  };
}

function collectApprovals(result: WorkflowResult): ApprovalDecision[] {
  const fromTrajectory = result.childRuns
    .flatMap((child) => child.trajectory?.steps ?? child.result.trajectory.steps)
    .filter((step): step is TrajectoryStep & { approval: ApprovalDecision } => step.kind === "approval" && !!step.approval)
    .map((step) => step.approval);
  const fromEvents = result.trajectory.events
    .filter((event) => event.kind === "child_event" && event.event.kind === "approval")
    .map((event) => event.kind === "child_event" && event.event.kind === "approval"
      ? { request: event.event.request, approved: event.event.approved, decidedAt: event.event.decidedAt }
      : null)
    .filter((approval): approval is ApprovalDecision => approval !== null);
  const seen = new Set<string>();
  return [...fromTrajectory, ...fromEvents].filter((approval) => {
    const key = `${approval.request.toolName}:${approval.decidedAt}:${approval.approved}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectFailures(result: WorkflowResult): FailureSummary[] {
  const failures = [
    ...(result.failure ? [result.failure] : []),
    ...result.childRuns.flatMap((child) => child.result.failure ? [child.result.failure] : []),
  ];
  const seen = new Set<string>();
  return failures.filter((failure) => {
    const key = `${failure.code}:${failure.layer}:${failure.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildArtifacts(options: BuildRunRecordOptions): RunArtifact[] {
  return [
    ...(options.trajectoryPath ? [{ kind: "trajectory" as const, path: options.trajectoryPath }] : []),
    ...(options.workflowTrajectoryPath ? [{ kind: "workflow_trajectory" as const, path: options.workflowTrajectoryPath }] : []),
  ];
}

function statusForWorkflowExit(exitReason: WorkflowExitReason): RunStatus {
  switch (exitReason) {
    case "success":
      return "succeeded";
    case "timeout":
    case "budget_exceeded":
    case "max_iterations":
      return "cancelled";
    case "child_escalated":
      return "degraded";
    case "verified_failure":
    case "child_error":
      return "failed";
  }
}

function countEvents(events: WorkflowEvent[], steps: TrajectoryStep[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    increment(counts, event.kind);
    if (event.kind === "child_event") increment(counts, event.event.kind);
  }
  for (const step of steps) increment(counts, step.kind);
  return counts;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function oneLine(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function highestRisk(risks: RiskLevel[]): RiskLevel | "R0" {
  const order = ["R0", "R1", "R2", "R3", "R4", "R5"] as const;
  return risks.reduce<RiskLevel | "R0">((highest, risk) =>
    order.indexOf(risk) > order.indexOf(highest) ? risk : highest, "R0");
}
