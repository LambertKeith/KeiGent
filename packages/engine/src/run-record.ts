import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { failureSummaryForWorkflowExit, type FailureSummary } from "./failures.js";
import { proofBoundaryForRunRecord, proofBoundaryForWorkflowResult, type ProofBoundary } from "./proof-boundary.js";
import { redactObject, redactText } from "./redaction.js";
import { addMigrationDiagnostics, emptyMigrationReport, sortMigrationWarnings, type RunStoreMigrationReport } from "./run-store-migration.js";
import type { ApprovalDecision, PermissionLevel, RiskLevel, SideEffect } from "./tools/types.js";
import type { SkillMatchExplanation, Task, Trajectory, TrajectoryStep } from "./types.js";
import { buildAutonomySummary, emptyAutonomySummary } from "./workflow/autonomy.js";
import type { AutonomySummary, ChildWorkspaceSummary, ReviewSummary, WorkflowChildRole, WorkflowEvidence, WorkflowEvent, WorkflowExitReason, WorkflowResult } from "./workflow/types.js";

export type RunStatus =
  | "created"
  | "routed"
  | "running"
  | "awaiting_approval"
  | "verifying"
  | "succeeded"
  | "failed"
  | "degraded"
  | "cancelled"
  | "no_op"
  | "unknown";

export type RunTaskSource = "cli" | "web" | "eval" | "replay" | "automation" | "unknown";
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
  budget: WorkflowResult["budget"];
  budgetUsage: WorkflowResult["budgetUsage"];
  budgetExceeded: boolean;
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

export interface ChildRunSummary {
  id: string;
  role: WorkflowChildRole | "judge";
  profile?: string;
  exitReason: string;
  iterations: number;
  toolCalls: number;
  checkpointsPassed: number;
  workspace?: ChildWorkspaceSummary;
}

export interface SkillRunSummary {
  name: string;
  status?: string;
  reason: string;
  injected: boolean;
  riskDelta: RiskLevel | "R0";
  evalCoverage: string[];
}

export interface ToolRunSummary {
  name: string;
  attempted: boolean;
  succeeded: boolean;
  permission?: PermissionLevel;
  riskLevel?: RiskLevel;
  sideEffect?: SideEffect;
  targetResource?: string;
}

export interface RunArtifact {
  kind: "trajectory" | "workflow_trajectory" | "record" | "eval_case" | "eval_report" | "replay_report" | "triage_report" | "generated_file" | "diff" | "log_excerpt";
  path: string;
}

export interface AutomationSummary {
  trigger: "schedule" | "event" | "manual" | "goal_condition";
  scope: string;
  noOpReason?: string;
  doesNotProve: string[];
  sourceRunIds?: string[];
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
  parentRunId?: string;
  childRunIds?: string[];
  childRole?: WorkflowChildRole | "judge";
  task: RunTaskSnapshot;
  route: RouteDecisionSnapshot;
  workflow?: WorkflowSnapshot;
  childRuns?: ChildRunSummary[];
  execution: ExecutionSummary;
  skills?: SkillRunSummary[];
  tools?: ToolRunSummary[];
  evidence: EvidenceSummary;
  risk: RiskSummary;
  approvals: ApprovalSummary[];
  failures: FailureSummary[];
  artifacts: RunArtifact[];
  automation?: AutomationSummary;
  review?: ReviewSummary;
  nextAction?: string;
  autonomy: AutonomySummary;
  proofBoundary: ProofBoundary;
  replay: ReplayCapability;
  redaction: RedactionSummary;
}

export interface BuildRunRecordOptions {
  id?: string;
  createdAt?: string;
  taskSource?: RunTaskSource;
  parentRunId?: string;
  childRole?: WorkflowChildRole | "judge";
  trajectoryPath?: string;
  workflowTrajectoryPath?: string;
  replay?: Partial<ReplayCapability>;
}

export interface SaveRunRecordOptions {
  runsDir: string;
}

export interface BuildNoOpRunRecordOptions {
  id?: string;
  createdAt?: string;
  goal: string;
  trigger: AutomationSummary["trigger"];
  scope: string;
  noOpReason: string;
  doesNotProve: string[];
}

export interface RunStoreError {
  runId: string;
  path: string;
  code: "missing_record" | "invalid_json" | "invalid_record";
  message: string;
}

export interface RunStoreReadResult {
  records: RunRecord[];
  errors: RunStoreError[];
  migrationReport: RunStoreMigrationReport;
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
  const failures = redactObject(collectFailures(result)) as FailureSummary[];
  const nextAction = failures[0]?.nextAction ?? failureSummaryForWorkflowExit(result.exitReason)?.nextAction;

  const replay = redactObject({
    supported: true,
    trajectoryPath: options.workflowTrajectoryPath ?? options.trajectoryPath,
    trajectorySchemaVersion: result.trajectory.schemaVersion,
    freshExecution: true,
    ...options.replay,
  }) as ReplayCapability;
  const partial = {
    status: statusForWorkflowExit(result.exitReason),
    evidence,
    replay,
    failures,
  };
  const proofBoundary = redactObject(mergeRecordProof(proofBoundaryForWorkflowResult(result), proofBoundaryForRunRecord(partial))) as ProofBoundary;
  const autonomy = result.autonomy ?? result.trajectory.autonomy ?? buildAutonomySummary({
    exitReason: result.exitReason,
    childRuns: result.childRuns,
    evidence: result.evidence,
  });

  return {
    schemaVersion: 1,
    id: options.id ?? makeRunId(createdAt),
    createdAt,
    updatedAt: createdAt,
    status: partial.status,
    ...(options.parentRunId ? { parentRunId: options.parentRunId } : {}),
    childRunIds: result.childRuns.map((child) => child.id),
    ...(options.childRole ? { childRole: options.childRole } : {}),
    task: summarizeTask(task, result, trajectory, options.taskSource ?? "unknown"),
    route,
    workflow: {
      id: result.workflowId,
      mode: result.mode,
      exitReason: result.exitReason,
      childRuns: result.childRuns.length,
      budget: result.budget,
      budgetUsage: result.budgetUsage,
      budgetExceeded: result.exitReason === "budget_exceeded" || result.evidence.some((item) => item.kind === "budget" && !item.passed),
    },
    childRuns: summarizeChildRuns(result),
    execution: summarizeExecution(result, trajectory),
    skills: summarizeSkills(result),
    tools: summarizeTools(result, approvals),
    evidence,
    risk: summarizeRisk(approvals),
    approvals: approvals.map(summarizeApproval),
    failures,
    artifacts,
    ...(nextAction ? { nextAction: redactText(nextAction) } : {}),
    autonomy,
    ...(result.review ? { review: redactObject(result.review) as ReviewSummary } : {}),
    proofBoundary,
    replay,
    redaction: { applied: true, rawPayloadStored: false },
  };
}

export function buildNoOpRunRecord(options: BuildNoOpRunRecordOptions): RunRecord {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const nextAction = "Review automation scope before treating no-op as health.";
  const replay = { supported: false, unsupportedReason: "No-op automation produced no trajectory.", freshExecution: true };
  const automation = {
    trigger: options.trigger,
    scope: options.scope,
    noOpReason: options.noOpReason,
    doesNotProve: options.doesNotProve,
  };
  const proofBoundary = proofBoundaryForRunRecord({
    status: "no_op",
    evidence: { status: "not_checked", total: 0, passed: 0, failed: 0, sources: [], blocking: [] },
    failures: [],
    automation,
    replay,
  });
  return {
    schemaVersion: 1,
    id: options.id ?? makeRunId(createdAt),
    createdAt,
    updatedAt: createdAt,
    status: "no_op",
    task: {
      goal: options.goal,
      source: "automation",
      requestedWorkflowMode: "single-loop",
      resolvedWorkflowMode: "single-loop",
    },
    route: { source: "unknown", matchedSkillIds: [] },
    execution: {
      iterations: 0,
      totalToolCalls: 0,
      successfulToolCalls: 0,
      failedToolCalls: 0,
      checkpointCount: 0,
      passedCheckpoints: 0,
      durationMs: 0,
      exitReason: "no_op",
      finalResponseSummary: options.noOpReason,
      eventCounts: {},
    },
    skills: [],
    tools: [],
    evidence: { status: "not_checked", total: 0, passed: 0, failed: 0, sources: [], blocking: [] },
    risk: {
      highestRiskLevel: "R0",
      permissionClassesUsed: [],
      sideEffectsAttempted: 0,
      sideEffectsSucceeded: 0,
      externalSideEffects: 0,
      irreversibleActions: 0,
      approvalRequired: false,
    },
    approvals: [],
    failures: [],
    artifacts: [],
    automation,
    nextAction,
    autonomy: emptyAutonomySummary(),
    proofBoundary,
    replay,
    redaction: { applied: true, rawPayloadStored: false },
  };
}

export async function saveRunRecord(record: RunRecord, options: SaveRunRecordOptions): Promise<string> {
  const dir = join(options.runsDir, record.id);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "record.json");
  const redactedRecord = redactObject(record) as RunRecord;
  const redactedPath = redactText(path);
  if (!redactedRecord.artifacts.some((artifact) => artifact.kind === "record" && artifact.path === redactedPath)) {
    redactedRecord.artifacts.push({ kind: "record", path: redactedPath });
  }
  await writeFile(path, `${JSON.stringify(redactedRecord, null, 2)}\n`, "utf8");
  return path;
}

export async function readRunRecord(path: string): Promise<RunRecord> {
  return normalizeRunRecordShape(JSON.parse(await readFile(path, "utf8")));
}

export async function readRunStore(options: SaveRunRecordOptions): Promise<RunStoreReadResult> {
  const records: RunRecord[] = [];
  const errors: RunStoreError[] = [];
  const migrationReport = emptyMigrationReport();
  let entries: string[] = [];
  try {
    entries = await readdir(options.runsDir);
  } catch {
    return { records, errors, migrationReport };
  }

  for (const runId of entries) {
    const path = join(options.runsDir, runId, "record.json");
    try {
      const raw = JSON.parse(await readFile(path, "utf8"));
      const record = normalizeRunRecordShape(raw);
      if (!record || typeof record.id !== "string" || record.id === "unknown") {
        errors.push({ runId, path: redactText(path), code: "invalid_record", message: "record.id must be a string" });
        continue;
      }
      migrationReport.totalRecords += 1;
      addMigrationDiagnostics(migrationReport, raw, record, redactText(path));
      records.push(record);
    } catch (error) {
      errors.push({
        runId,
        path: redactText(path),
        code: error instanceof SyntaxError ? "invalid_json" : "missing_record",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  records.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  sortMigrationWarnings(migrationReport);
  return { records, errors, migrationReport };
}

function normalizeRunRecordShape(input: unknown): RunRecord {
  const source = objectValue(input);
  const task = objectValue(source.task);
  const route = objectValue(source.route);
  const execution = objectValue(source.execution);
  const evidence = objectValue(source.evidence);
  const risk = objectValue(source.risk);
  const replay = objectValue(source.replay);
  const successDef = successDefValue(task.successDef);
  const status = statusValue(source.status);
  const evidenceSummary: EvidenceSummary = {
    status: evidenceStatusValue(evidence.status),
    total: numberValue(evidence.total),
    passed: numberValue(evidence.passed),
    failed: numberValue(evidence.failed),
    sources: stringArray(evidence.sources),
    blocking: stringArray(evidence.blocking),
  };
  const failures = Array.isArray(source.failures) ? redactObject(source.failures) as FailureSummary[] : [];
  const automation = isObject(source.automation) ? redactObject(source.automation) as unknown as AutomationSummary : undefined;
  const review = isObject(source.review) ? reviewValue(source.review) : undefined;
  const replayCapability: ReplayCapability = {
    supported: replay.supported === true,
    ...(typeof replay.unsupportedReason === "string" ? { unsupportedReason: redactText(replay.unsupportedReason) } : {}),
    ...(typeof replay.trajectoryPath === "string" ? { trajectoryPath: redactText(replay.trajectoryPath) } : {}),
    ...(typeof replay.trajectorySchemaVersion === "number" ? { trajectorySchemaVersion: replay.trajectorySchemaVersion } : {}),
    ...(typeof replay.latestReplayReportId === "string" ? { latestReplayReportId: redactText(replay.latestReplayReportId) } : {}),
    freshExecution: replay.freshExecution !== false,
  };
  const proofBoundary = isObject(source.proofBoundary)
    ? proofBoundaryValue(source.proofBoundary)
    : proofBoundaryForRunRecord({ status, evidence: evidenceSummary, ...(automation ? { automation } : {}), replay: replayCapability, failures });

  return {
    schemaVersion: 1,
    id: stringValue(source.id, "unknown"),
    createdAt: stringValue(source.createdAt, ""),
    updatedAt: stringValue(source.updatedAt, stringValue(source.createdAt, "")),
    status,
    ...(typeof source.parentRunId === "string" ? { parentRunId: redactText(source.parentRunId) } : {}),
    ...(stringArray(source.childRunIds).length ? { childRunIds: stringArray(source.childRunIds) } : {}),
    ...(childRoleValue(source.childRole) ? { childRole: childRoleValue(source.childRole)! } : {}),
    task: {
      goal: stringValue(task.goal, "Unknown run"),
      source: taskSourceValue(task.source),
      ...(typeof task.requestedProfile === "string" ? { requestedProfile: redactText(task.requestedProfile) } : {}),
      ...(typeof task.resolvedProfile === "string" ? { resolvedProfile: redactText(task.resolvedProfile) } : {}),
      ...(typeof task.requestedWorkflowMode === "string" ? { requestedWorkflowMode: redactText(task.requestedWorkflowMode) } : {}),
      ...(typeof task.resolvedWorkflowMode === "string" ? { resolvedWorkflowMode: redactText(task.resolvedWorkflowMode) } : {}),
      ...(successDef ? { successDef } : {}),
    },
    route: {
      ...(typeof route.selectedProfile === "string" ? { selectedProfile: redactText(route.selectedProfile) } : {}),
      source: routeSourceValue(route.source),
      ...(typeof route.ruleId === "string" ? { ruleId: redactText(route.ruleId) } : {}),
      ...(typeof route.rationale === "string" ? { rationale: redactText(route.rationale) } : {}),
      ...(typeof route.guardApplied === "boolean" ? { guardApplied: route.guardApplied } : {}),
      ...(typeof route.unguardedProfile === "string" ? { unguardedProfile: redactText(route.unguardedProfile) } : {}),
      matchedSkillIds: stringArray(route.matchedSkillIds),
    },
    ...(isObject(source.workflow) ? { workflow: redactObject(source.workflow) as unknown as RunRecord["workflow"] } : {}),
    ...(Array.isArray(source.childRuns) ? { childRuns: redactObject(source.childRuns) as unknown as NonNullable<RunRecord["childRuns"]> } : {}),
    execution: {
      iterations: numberValue(execution.iterations),
      totalToolCalls: numberValue(execution.totalToolCalls),
      successfulToolCalls: numberValue(execution.successfulToolCalls),
      failedToolCalls: numberValue(execution.failedToolCalls),
      checkpointCount: numberValue(execution.checkpointCount),
      passedCheckpoints: numberValue(execution.passedCheckpoints),
      durationMs: numberValue(execution.durationMs),
      exitReason: stringValue(execution.exitReason, "unknown"),
      finalResponseSummary: stringValue(execution.finalResponseSummary, ""),
      eventCounts: recordOfNumbers(execution.eventCounts),
    },
    ...(Array.isArray(source.skills) ? { skills: redactObject(source.skills) as SkillRunSummary[] } : {}),
    ...(Array.isArray(source.tools) ? { tools: redactObject(source.tools) as ToolRunSummary[] } : {}),
    evidence: evidenceSummary,
    risk: {
      highestRiskLevel: riskLevelValue(risk.highestRiskLevel),
      permissionClassesUsed: stringArray(risk.permissionClassesUsed) as PermissionLevel[],
      sideEffectsAttempted: numberValue(risk.sideEffectsAttempted),
      sideEffectsSucceeded: numberValue(risk.sideEffectsSucceeded),
      externalSideEffects: numberValue(risk.externalSideEffects),
      irreversibleActions: numberValue(risk.irreversibleActions),
      approvalRequired: risk.approvalRequired === true,
    },
    approvals: Array.isArray(source.approvals) ? redactObject(source.approvals) as ApprovalSummary[] : [],
    failures,
    artifacts: Array.isArray(source.artifacts) ? redactObject(source.artifacts) as RunArtifact[] : [],
    ...(automation ? { automation } : {}),
    ...(review ? { review } : {}),
    ...(typeof source.nextAction === "string" ? { nextAction: redactText(source.nextAction) } : {}),
    autonomy: autonomyValue(source.autonomy),
    proofBoundary,
    replay: replayCapability,
    redaction: isObject(source.redaction)
      ? redactObject(source.redaction) as unknown as RedactionSummary
      : { applied: true, rawPayloadStored: false },
  };
}

function mergeRecordProof(workflow: ProofBoundary, record: ProofBoundary): ProofBoundary {
  return {
    proven: [...new Set([...workflow.proven, ...record.proven])],
    notProven: [...new Set([...workflow.notProven, ...record.notProven])],
    assumptions: [...new Set([...workflow.assumptions, ...record.assumptions])],
    evidenceGaps: [...new Set([...workflow.evidenceGaps, ...record.evidenceGaps])],
  };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? redactText(value) : fallback;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => redactText(item)) : [];
}

function recordOfNumbers(value: unknown): Record<string, number> {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

function successDefValue(value: unknown): RunRecord["task"]["successDef"] | undefined {
  const source = objectValue(value);
  const goal = source.goal;
  const assertionCount = source.assertionCount;
  if (typeof goal !== "string" || typeof assertionCount !== "number") return undefined;
  return { goal: redactText(goal), assertionCount };
}

function statusValue(value: unknown): RunStatus {
  const allowed = new Set<RunStatus>([
    "created",
    "routed",
    "running",
    "awaiting_approval",
    "verifying",
    "succeeded",
    "failed",
    "degraded",
    "cancelled",
    "no_op",
    "unknown",
  ]);
  return typeof value === "string" && allowed.has(value as RunStatus) ? value as RunStatus : "unknown";
}

function taskSourceValue(value: unknown): RunTaskSource {
  const allowed = new Set<RunTaskSource>(["cli", "web", "eval", "replay", "automation", "unknown"]);
  return typeof value === "string" && allowed.has(value as RunTaskSource) ? value as RunTaskSource : "unknown";
}

function routeSourceValue(value: unknown): RouteDecisionSnapshot["source"] {
  const allowed = new Set<RouteDecisionSnapshot["source"]>(["explicit", "rule", "skill-match", "llm", "guard", "unknown"]);
  return typeof value === "string" && allowed.has(value as RouteDecisionSnapshot["source"])
    ? value as RouteDecisionSnapshot["source"]
    : "unknown";
}

function evidenceStatusValue(value: unknown): RunEvidenceStatus {
  const allowed = new Set<RunEvidenceStatus>(["passed", "failed", "not_checked", "insufficient_evidence"]);
  return typeof value === "string" && allowed.has(value as RunEvidenceStatus) ? value as RunEvidenceStatus : "not_checked";
}

function riskLevelValue(value: unknown): RiskLevel | "R0" {
  const allowed = new Set<RiskLevel | "R0">(["R0", "R1", "R2", "R3", "R4", "R5"]);
  return typeof value === "string" && allowed.has(value as RiskLevel | "R0") ? value as RiskLevel | "R0" : "R0";
}

function childRoleValue(value: unknown): WorkflowChildRole | "judge" | undefined {
  const allowed = new Set<WorkflowChildRole | "judge">(["worker", "reviewer", "verifier", "judge"]);
  return typeof value === "string" && allowed.has(value as WorkflowChildRole | "judge")
    ? value as WorkflowChildRole | "judge"
    : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectValue(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function proofBoundaryValue(value: unknown): ProofBoundary {
  const source = objectValue(value);
  return {
    proven: stringArray(source.proven),
    notProven: stringArray(source.notProven),
    assumptions: stringArray(source.assumptions),
    evidenceGaps: stringArray(source.evidenceGaps),
  };
}

function reviewValue(value: unknown): ReviewSummary | undefined {
  const source = objectValue(value);
  const rubric = objectValue(source.rubric);
  const reviewerRunId = stringValue(source.reviewerRunId, "");
  if (!reviewerRunId) return undefined;
  return {
    reviewerRunId,
    rubric: {
      taskGoal: stringValue(rubric.taskGoal, "Unknown review task"),
      successCriteria: stringArray(rubric.successCriteria),
      requiredEvidence: stringArray(rubric.requiredEvidence),
      forbiddenClaims: stringArray(rubric.forbiddenClaims),
      falseConfidenceRisks: stringArray(rubric.falseConfidenceRisks),
      blockingIssueRules: stringArray(rubric.blockingIssueRules),
    },
    issues: Array.isArray(source.issues)
      ? source.issues.map(reviewIssueValue)
      : [],
  };
}

function reviewIssueValue(value: unknown): ReviewSummary["issues"][number] {
  const source = objectValue(value);
  const severity = source.severity === "non_blocking" ? "non_blocking" : "blocking";
  const evidenceKind = source.evidenceKind === "assertion" ||
    source.evidenceKind === "policy" ||
    source.evidenceKind === "budget" ||
    source.evidenceKind === "child_result"
    ? source.evidenceKind
    : "checkpoint";
  return {
    severity,
    sourceChildRunId: stringValue(source.sourceChildRunId, "unknown-reviewer"),
    message: stringValue(source.message, "Review issue reported."),
    evidenceKind,
    ...(typeof source.assertion === "string" ? { assertion: redactText(source.assertion) } : {}),
  };
}

function autonomyValue(value: unknown): AutonomySummary {
  const source = objectValue(value);
  return {
    outcome: autonomyOutcomeValue(source.outcome),
    repairAttempts: Array.isArray(source.repairAttempts)
      ? source.repairAttempts.map(repairAttemptValue)
      : [],
    escalations: Array.isArray(source.escalations)
      ? source.escalations.map(escalationValue)
      : [],
  };
}

function repairAttemptValue(value: unknown): AutonomySummary["repairAttempts"][number] {
  const source = objectValue(value);
  return {
    targetAssertion: stringValue(source.targetAssertion, "unknown assertion"),
    reason: stringValue(source.reason, "repair requested"),
    attempt: numberValue(source.attempt),
    finalVerdict: repairVerdictValue(source.finalVerdict),
  };
}

function escalationValue(value: unknown): AutonomySummary["escalations"][number] {
  const source = objectValue(value);
  return {
    reason: escalationReasonValue(source.reason),
    message: stringValue(source.message, "Escalation required."),
  };
}

function autonomyOutcomeValue(value: unknown): AutonomySummary["outcome"] {
  const allowed = new Set<AutonomySummary["outcome"]>([
    "completed_without_escalation",
    "self_repaired",
    "degraded_without_escalation",
    "escalated",
  ]);
  return typeof value === "string" && allowed.has(value as AutonomySummary["outcome"])
    ? value as AutonomySummary["outcome"]
    : "completed_without_escalation";
}

function repairVerdictValue(value: unknown): AutonomySummary["repairAttempts"][number]["finalVerdict"] {
  const allowed = new Set<AutonomySummary["repairAttempts"][number]["finalVerdict"]>(["passed", "failed", "budget_exhausted"]);
  return typeof value === "string" && allowed.has(value as AutonomySummary["repairAttempts"][number]["finalVerdict"])
    ? value as AutonomySummary["repairAttempts"][number]["finalVerdict"]
    : "failed";
}

function escalationReasonValue(value: unknown): AutonomySummary["escalations"][number]["reason"] {
  const allowed = new Set<AutonomySummary["escalations"][number]["reason"]>([
    "permission_required",
    "risk_confirmation_required",
    "goal_ambiguity_blocking",
    "evidence_insufficient_after_retry",
    "acceptance_failed_after_repair",
    "budget_exhausted",
    "external_dependency_blocked",
  ]);
  return typeof value === "string" && allowed.has(value as AutonomySummary["escalations"][number]["reason"])
    ? value as AutonomySummary["escalations"][number]["reason"]
    : "external_dependency_blocked";
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
    budgetSummaryLine(record),
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

function budgetSummaryLine(record: RunRecord): string {
  const budget = record.workflow?.budget;
  const usage = record.workflow?.budgetUsage;
  if (!budget || !usage) return "Budget: unknown";
  const parts = [
    `Budget: ${usage.iterations}/${budget.maxAggregateIterations ?? budget.maxIterationsPerRun} iterations`,
    `${usage.toolCalls}/${budget.maxAggregateToolCalls ?? budget.maxToolCallsPerRun ?? "?"} tools`,
  ];
  if (usage.tokenEstimate !== undefined || budget.maxAggregateTokenEstimate !== undefined || budget.maxTokenEstimatePerRun !== undefined) {
    parts.push(`${usage.tokenEstimate ?? 0}/${budget.maxAggregateTokenEstimate ?? budget.maxTokenEstimatePerRun ?? "?"} estimated tokens`);
  }
  if (usage.providerUsage) {
    parts.push(`provider tokens ${usage.providerUsage.totalTokens}`);
    parts.push(usage.providerUsage.costStatus === "priced"
      ? `provider cost $${usage.providerUsage.costUsd.toFixed(6)}`
      : "provider cost pricing_not_configured");
  }
  parts.push(`${usage.recoveryAttempts ?? 0}/${budget.maxRecoveryAttemptsPerRun ?? "?"} recoveries`);
  return parts.join(", ");
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
    goal: redactText(task?.goal ?? result.finalResponse),
    source,
    ...(task?.profile ? { requestedProfile: redactText(task.profile) } : {}),
    ...(trajectory?.profile ? { resolvedProfile: redactText(trajectory.profile) } : {}),
    requestedWorkflowMode: redactText(result.mode),
    resolvedWorkflowMode: redactText(result.mode),
    ...(task?.successDef
      ? { successDef: { goal: redactText(task.successDef.goal), assertionCount: task.successDef.assertions.length } }
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
    ...(profileEvent?.profile ?? trajectory?.profile ? { selectedProfile: redactText((profileEvent?.profile ?? trajectory?.profile)!) } : {}),
    source: profileEvent?.guardApplied ? "guard" : via === "rule" ? "rule" : via === "llm" ? "llm" : "unknown",
    ...(profileEvent?.ruleId ? { ruleId: redactText(profileEvent.ruleId) } : {}),
    ...(profileEvent?.rationale ? { rationale: redactText(profileEvent.rationale) } : {}),
    guardApplied: profileEvent?.guardApplied,
    ...(profileEvent?.unguardedProfile ? { unguardedProfile: redactText(profileEvent.unguardedProfile) } : {}),
    matchedSkillIds: matchedSkillIds.map(redactText),
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
    finalResponseSummary: redactText(oneLine(result.finalResponse, 240)),
    eventCounts: countEvents(result.trajectory.events, steps),
  };
}

function summarizeChildRuns(result: WorkflowResult): ChildRunSummary[] {
  return result.childRuns.map((child) => ({
    id: child.id,
    role: child.role,
    profile: child.trajectory?.profile ?? child.result.trajectory.profile,
    exitReason: child.result.exitReason,
    iterations: child.result.iterations,
    toolCalls: child.result.totalToolCalls,
    checkpointsPassed: child.result.checkpointsPassed,
    ...(child.workspace ? { workspace: summarizeChildWorkspace(child.workspace) } : {}),
  }));
}

function summarizeChildWorkspace(workspace: ChildWorkspaceSummary): ChildWorkspaceSummary {
  return {
    workspaceId: redactText(workspace.workspaceId),
    ...(workspace.branchName ? { branchName: redactText(workspace.branchName) } : {}),
    ...(workspace.workspacePath ? { workspacePath: redactText(workspace.workspacePath) } : {}),
    ...(workspace.manifestPath ? { manifestPath: redactText(workspace.manifestPath) } : {}),
    status: workspace.status,
    ...(workspace.cleanupMode ? { cleanupMode: workspace.cleanupMode } : {}),
    ...(workspace.abandonedReason ? { abandonedReason: redactText(workspace.abandonedReason) } : {}),
    artifacts: workspace.artifacts.map((artifact) => ({
      kind: artifact.kind,
      path: redactText(artifact.path),
      relativePath: redactText(artifact.relativePath),
      sizeBytes: artifact.sizeBytes,
    })),
    conflicts: workspace.conflicts.map((conflict) => ({
      relativePath: redactText(conflict.relativePath),
      workspaceIds: conflict.workspaceIds.map(redactText),
      childRunIds: conflict.childRunIds.map(redactText),
    })),
  };
}

function summarizeSkills(result: WorkflowResult): SkillRunSummary[] {
  const matches = result.childRuns
    .flatMap((child) => child.trajectory?.steps ?? child.result.trajectory.steps)
    .flatMap((step) => step.kind === "skill_match" ? step.skillMatches ?? [] : []);
  const byName = new Map<string, SkillMatchExplanation>();
  for (const match of matches) {
    if (!byName.has(match.name)) byName.set(match.name, match);
  }
  return [...byName.values()].map((match) => ({
    name: redactText(match.name),
    ...(match.status ? { status: redactText(match.status) } : {}),
    reason: redactText(match.matchedBy?.join(", ") || match.signals.join(", ") || "matched"),
    injected: match.injected,
    riskDelta: parseRiskDelta(match.riskDelta),
    evalCoverage: (match.evalCoverage ?? []).map(redactText),
  }));
}

function summarizeTools(result: WorkflowResult, approvals: ApprovalDecision[]): ToolRunSummary[] {
  const approvalByTool = new Map(approvals.map((approval) => [approval.request.toolName, approval]));
  const steps = result.childRuns.flatMap((child) => child.trajectory?.steps ?? child.result.trajectory.steps);
  const toolSteps = steps.filter((step) => step.kind === "tool_call" && step.toolName);
  const summaries: ToolRunSummary[] = toolSteps.map((step) => {
    const approval = approvalByTool.get(step.toolName!);
    return {
      name: redactText(step.toolName!),
      attempted: true,
      succeeded: step.toolSucceeded === true,
      ...(approval ? {
        permission: approval.request.permission,
        riskLevel: approval.request.riskLevel,
        sideEffect: approval.request.sideEffect,
        targetResource: redactText(approval.request.targetResource),
      } : {}),
    };
  });
  for (const approval of approvals) {
    if (!summaries.some((tool) => tool.name === approval.request.toolName)) {
      summaries.push({
        name: redactText(approval.request.toolName),
        attempted: false,
        succeeded: false,
        permission: approval.request.permission,
        riskLevel: approval.request.riskLevel,
        sideEffect: approval.request.sideEffect,
        targetResource: redactText(approval.request.targetResource),
      });
    }
  }
  return summaries;
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
    sources: [...new Set(evidence.map((item) => item.kind))].map(redactText),
    blocking: evidence.filter((item) => !item.passed).map((item) => redactText(item.message)),
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
    toolName: redactText(approval.request.toolName),
    approved: approval.approved,
    decidedAt: approval.decidedAt,
    riskLevel: approval.request.riskLevel,
    permission: approval.request.permission,
    sideEffect: approval.request.sideEffect,
    reversible: approval.request.reversible,
    targetResource: redactText(approval.request.targetResource),
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
    ...(failureSummaryForWorkflowExit(result.exitReason) ? [failureSummaryForWorkflowExit(result.exitReason)!] : []),
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
    ...(options.trajectoryPath ? [{ kind: "trajectory" as const, path: redactText(options.trajectoryPath) }] : []),
    ...(options.workflowTrajectoryPath ? [{ kind: "workflow_trajectory" as const, path: redactText(options.workflowTrajectoryPath) }] : []),
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

function parseRiskDelta(value: string | undefined): RiskLevel | "R0" {
  const match = /\bR[0-5]\b/.exec(value ?? "");
  return match ? match[0] as RiskLevel | "R0" : "R0";
}
