import type { ApprovalSummary, AutonomySummary, ProofBoundary, ProviderUsageSummary, ReviewSummary, RunRecord, SkillRunSummary, ToolRunSummary } from "@keigent/engine";
import { redactObject, redactText } from "../shared/redaction.js";

export interface RunRecordListItem {
  id: string;
  status: string;
  createdAt: string;
  goal: string;
  profile: string;
  workflowMode: string;
  evidenceStatus: string;
  evidenceLabel: string;
  riskLabel: string;
  durationMs: number;
  durationLabel: string;
  approvalRequired: boolean;
  replayAvailable: boolean;
}

export interface RunEvidencePanel {
  status: string;
  total: number;
  passed: number;
  failed: number;
  blocking: string[];
  sources: string[];
}

export interface RunRiskPanel {
  highestRiskLevel: string;
  approvalRequired: boolean;
  sideEffectsAttempted: number;
  sideEffectsSucceeded: number;
  irreversibleActions: number;
  permissions: string[];
}

export interface RunReplayPanel {
  supported: boolean;
  freshExecution: boolean;
  trajectoryPath?: string;
  latestReplayReportId?: string;
  label: string;
}

export interface RunTimelineFact {
  label: string;
  value: string;
}

export interface RunBudgetMetric {
  used: number;
  limit: number | null;
  label: string;
}

export interface RunBudgetPanel {
  exceeded: boolean;
  childRuns: RunBudgetMetric;
  iterations: RunBudgetMetric;
  toolCalls: RunBudgetMetric;
  tokenEstimate: RunBudgetMetric;
  providerUsage: RunProviderUsagePanel;
  recoveryAttempts: RunBudgetMetric;
  durationMs: RunBudgetMetric;
}

export interface RunProviderUsagePanel {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens: number;
  tokenLabel: string;
  costUsd?: number;
  costLabel: string;
  costStatus: ProviderUsageSummary["costStatus"] | "not_reported";
}

export interface RunRecordDetailView {
  summary: RunRecordListItem;
  route: {
    source: string;
    selectedProfile: string;
    rationale?: string;
    matchedSkillIds: string[];
  };
  skills: SkillRunSummary[];
  tools: ToolRunSummary[];
  evidence: RunEvidencePanel;
  risk: RunRiskPanel;
  budget: RunBudgetPanel;
  replay: RunReplayPanel;
  autonomy: AutonomySummary;
  proofBoundary: ProofBoundary;
  review?: ReviewSummary;
  approvals: Array<{
    toolName: string;
    approved: boolean;
    riskLevel: string;
    targetResource: string;
  }>;
  artifacts: Array<{ kind: string; path: string }>;
  failures: Array<{ code: string; layer: string; message: string; nextAction: string }>;
  nextAction: {
    required: boolean;
    label: string;
  };
  timelineFacts: RunTimelineFact[];
  rawJson: string;
}

export interface RunRecordCollectionView {
  empty: boolean;
  emptyMessage?: string;
  runs: RunRecordListItem[];
}

export function normalizeRunRecord(input: unknown): RunRecordDetailView {
  const record = normalizeRecordShape(input);
  const summary = listItemFor(record);
  return {
    summary,
    route: {
      source: redactText(record.route.source),
      selectedProfile: redactText(record.route.selectedProfile ?? "unknown"),
      ...(record.route.rationale ? { rationale: redactText(record.route.rationale) } : {}),
      matchedSkillIds: record.route.matchedSkillIds.map((item) => redactText(item)),
    },
    skills: skillsFor(record),
    tools: toolsFor(record),
    evidence: {
      status: record.evidence.status,
      total: record.evidence.total,
      passed: record.evidence.passed,
      failed: record.evidence.failed,
      blocking: record.evidence.blocking.map((item) => redactText(item)),
      sources: record.evidence.sources.map((item) => redactText(item)),
    },
    risk: {
      highestRiskLevel: record.risk.highestRiskLevel,
      approvalRequired: record.risk.approvalRequired,
      sideEffectsAttempted: record.risk.sideEffectsAttempted,
      sideEffectsSucceeded: record.risk.sideEffectsSucceeded,
      irreversibleActions: record.risk.irreversibleActions,
      permissions: record.risk.permissionClassesUsed.map((permission) => redactText(permission)),
    },
    budget: budgetPanel(record),
    replay: {
      supported: record.replay.supported,
      freshExecution: record.replay.freshExecution,
      ...(record.replay.trajectoryPath ? { trajectoryPath: redactText(record.replay.trajectoryPath) } : {}),
      ...(record.replay.latestReplayReportId ? { latestReplayReportId: redactText(record.replay.latestReplayReportId) } : {}),
      label: replayLabel(record),
    },
    autonomy: {
      outcome: record.autonomy.outcome,
      repairAttempts: record.autonomy.repairAttempts.map((attempt) => ({
        targetAssertion: redactText(attempt.targetAssertion),
        reason: redactText(attempt.reason),
        attempt: attempt.attempt,
        finalVerdict: attempt.finalVerdict,
      })),
      escalations: record.autonomy.escalations.map((escalation) => ({
        reason: escalation.reason,
        message: redactText(escalation.message),
      })),
    },
    proofBoundary: {
      proven: record.proofBoundary.proven.map((item) => redactText(item)),
      notProven: record.proofBoundary.notProven.map((item) => redactText(item)),
      assumptions: record.proofBoundary.assumptions.map((item) => redactText(item)),
      evidenceGaps: record.proofBoundary.evidenceGaps.map((item) => redactText(item)),
    },
    ...(record.review ? { review: reviewPanel(record.review) } : {}),
    approvals: record.approvals.map((approval) => ({
      toolName: redactText(approval.toolName),
      approved: approval.approved,
      riskLevel: approval.riskLevel,
      targetResource: redactText(approval.targetResource),
    })),
    artifacts: record.artifacts.map((artifact) => ({
      kind: artifact.kind,
      path: redactText(artifact.path),
    })),
    failures: record.failures.map((failure) => ({
      code: failure.code,
      layer: failure.layer,
      message: redactText(failure.message),
      nextAction: redactText(failure.nextAction),
    })),
    nextAction: nextActionFor(record),
    timelineFacts: timelineFacts(record),
    rawJson: JSON.stringify(redactObject(record), null, 2),
  };
}

export function summarizeRunRecords(records: unknown[]): RunRecordCollectionView {
  if (records.length === 0) {
    return { empty: true, emptyMessage: "No run records saved", runs: [] };
  }
  return {
    empty: false,
    runs: records
      .map(normalizeRecordShape)
      .map(listItemFor)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

function listItemFor(record: RunRecord): RunRecordListItem {
  const profile = record.task.resolvedProfile ?? record.route.selectedProfile ?? "unknown";
  const workflowMode = record.task.resolvedWorkflowMode ?? record.workflow?.mode ?? "unknown";
  return {
    id: redactText(record.id),
    status: record.status,
    createdAt: record.createdAt,
    goal: redactText(record.task.goal),
    profile: redactText(profile),
    workflowMode: redactText(workflowMode),
    evidenceStatus: record.evidence.status,
    evidenceLabel: evidenceLabel(record),
    riskLabel: riskLabel(record),
    durationMs: record.execution.durationMs,
    durationLabel: durationLabel(record.execution.durationMs),
    approvalRequired: record.risk.approvalRequired,
    replayAvailable: record.replay.supported && Boolean(record.replay.trajectoryPath),
  };
}

function normalizeRecordShape(input: unknown): RunRecord {
  const source = objectValue(input);
  const route = objectValue(source.route);
  const task = objectValue(source.task);
  const evidence = objectValue(source.evidence);
  const risk = objectValue(source.risk);
  const replay = objectValue(source.replay);
  const execution = objectValue(source.execution);
  const successDef = successDefValue(task.successDef);
  const status = statusValue(source.status) as RunRecord["status"];
  const evidenceSummary: RunRecord["evidence"] = {
    status: evidenceStatusValue(evidence.status),
    total: numberValue(evidence.total),
    passed: numberValue(evidence.passed),
    failed: numberValue(evidence.failed),
    sources: stringArray(evidence.sources),
    blocking: stringArray(evidence.blocking),
  };
  const failures = Array.isArray(source.failures) ? source.failures as RunRecord["failures"] : [];
  const automation = isObject(source.automation) ? source.automation as unknown as RunRecord["automation"] : undefined;
  const replayCapability: RunRecord["replay"] = {
    supported: replay.supported === true,
    ...(typeof replay.unsupportedReason === "string" ? { unsupportedReason: replay.unsupportedReason } : {}),
    ...(typeof replay.trajectoryPath === "string" ? { trajectoryPath: replay.trajectoryPath } : {}),
    ...(typeof replay.trajectorySchemaVersion === "number" ? { trajectorySchemaVersion: replay.trajectorySchemaVersion } : {}),
    ...(typeof replay.latestReplayReportId === "string" ? { latestReplayReportId: replay.latestReplayReportId } : {}),
    freshExecution: replay.freshExecution !== false,
  };
  const proofBoundary = isObject(source.proofBoundary)
    ? proofBoundaryValue(source.proofBoundary)
    : fallbackProofBoundaryForRecord({ evidence: evidenceSummary, failures, ...(automation ? { automation } : {}), replay: replayCapability });
  const autonomy = isObject(source.autonomy) ? autonomyValue(source.autonomy) : emptyAutonomy();

  return {
    schemaVersion: 1,
    id: stringValue(source.id, "unknown"),
    createdAt: stringValue(source.createdAt, ""),
    updatedAt: stringValue(source.updatedAt, stringValue(source.createdAt, "")),
    status,
    task: {
      goal: stringValue(task.goal, "Unknown run"),
      source: taskSourceValue(task.source),
      ...(typeof task.requestedProfile === "string" ? { requestedProfile: task.requestedProfile } : {}),
      ...(typeof task.resolvedProfile === "string" ? { resolvedProfile: task.resolvedProfile } : {}),
      ...(typeof task.requestedWorkflowMode === "string" ? { requestedWorkflowMode: task.requestedWorkflowMode } : {}),
      ...(typeof task.resolvedWorkflowMode === "string" ? { resolvedWorkflowMode: task.resolvedWorkflowMode } : {}),
      ...(successDef ? { successDef } : {}),
    },
    route: {
      selectedProfile: typeof route.selectedProfile === "string" ? route.selectedProfile : undefined,
      source: routeSourceValue(route.source),
      ruleId: typeof route.ruleId === "string" ? route.ruleId : undefined,
      rationale: typeof route.rationale === "string" ? route.rationale : undefined,
      guardApplied: typeof route.guardApplied === "boolean" ? route.guardApplied : undefined,
      unguardedProfile: typeof route.unguardedProfile === "string" ? route.unguardedProfile : undefined,
      matchedSkillIds: stringArray(route.matchedSkillIds),
    },
    ...(isObject(source.workflow) ? { workflow: source.workflow as unknown as RunRecord["workflow"] } : {}),
    childRuns: Array.isArray(source.childRuns) ? source.childRuns as NonNullable<RunRecord["childRuns"]> : [],
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
    skills: Array.isArray(source.skills) ? source.skills as SkillRunSummary[] : undefined,
    tools: Array.isArray(source.tools) ? source.tools as ToolRunSummary[] : undefined,
    evidence: evidenceSummary,
    risk: {
      highestRiskLevel: stringValue(risk.highestRiskLevel, "R0") as RunRecord["risk"]["highestRiskLevel"],
      permissionClassesUsed: stringArray(risk.permissionClassesUsed) as RunRecord["risk"]["permissionClassesUsed"],
      sideEffectsAttempted: numberValue(risk.sideEffectsAttempted),
      sideEffectsSucceeded: numberValue(risk.sideEffectsSucceeded),
      externalSideEffects: numberValue(risk.externalSideEffects),
      irreversibleActions: numberValue(risk.irreversibleActions),
      approvalRequired: risk.approvalRequired === true,
    },
    approvals: Array.isArray(source.approvals) ? source.approvals as RunRecord["approvals"] : [],
    failures,
    artifacts: Array.isArray(source.artifacts) ? source.artifacts as RunRecord["artifacts"] : [],
    ...(automation ? { automation } : {}),
    ...(typeof source.nextAction === "string" ? { nextAction: source.nextAction } : {}),
    autonomy,
    replay: replayCapability,
    proofBoundary,
    ...(isObject(source.review) ? { review: reviewValue(source.review) } : {}),
    redaction: isObject(source.redaction) ? source.redaction as unknown as RunRecord["redaction"] : { applied: true, rawPayloadStored: false },
  };
}

function reviewPanel(review: ReviewSummary): ReviewSummary {
  return {
    reviewerRunId: redactText(review.reviewerRunId),
    rubric: {
      taskGoal: redactText(review.rubric.taskGoal),
      successCriteria: review.rubric.successCriteria.map(redactText),
      requiredEvidence: review.rubric.requiredEvidence.map(redactText),
      forbiddenClaims: review.rubric.forbiddenClaims.map(redactText),
      falseConfidenceRisks: review.rubric.falseConfidenceRisks.map(redactText),
      blockingIssueRules: review.rubric.blockingIssueRules.map(redactText),
    },
    issues: review.issues.map((issue) => ({
      severity: issue.severity,
      sourceChildRunId: redactText(issue.sourceChildRunId),
      message: redactText(issue.message),
      evidenceKind: issue.evidenceKind,
      ...(issue.assertion ? { assertion: redactText(issue.assertion) } : {}),
    })),
  };
}

function skillsFor(record: RunRecord): SkillRunSummary[] {
  if (record.skills?.length) return record.skills;
  return record.route.matchedSkillIds.map((name) => ({
    name,
    reason: "matched route",
    injected: true,
    riskDelta: "R0",
    evalCoverage: [],
  }));
}

function toolsFor(record: RunRecord): ToolRunSummary[] {
  if (record.tools?.length) return record.tools;
  return record.approvals.map((approval: ApprovalSummary) => ({
    name: approval.toolName,
    attempted: true,
    succeeded: approval.approved,
    permission: approval.permission,
    riskLevel: approval.riskLevel,
    sideEffect: approval.sideEffect,
    targetResource: approval.targetResource,
  }));
}

function nextActionFor(record: RunRecord): RunRecordDetailView["nextAction"] {
  if (record.nextAction) return { required: true, label: redactText(record.nextAction) };
  const failure = record.failures.find((item) => item.nextAction);
  if (failure) return { required: true, label: redactText(failure.nextAction) };
  if (String(record.status) === "unknown") {
    return { required: true, label: "Review run record schema before trusting this result." };
  }
  if (record.status === "failed" || record.status === "cancelled" || record.status === "degraded") {
    return { required: true, label: "Review failure evidence before retrying." };
  }
  return { required: false, label: "No action required" };
}

function evidenceLabel(record: RunRecord): string {
  if (record.evidence.total === 0) return "No evidence checked";
  return `${record.evidence.passed}/${record.evidence.total} evidence passed`;
}

function riskLabel(record: RunRecord): string {
  const approval = record.risk.approvalRequired ? "approval required" : "no approval";
  return `${record.risk.highestRiskLevel}, ${approval}`;
}

function durationLabel(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function replayLabel(record: RunRecord): string {
  if (!record.replay.supported) return record.replay.unsupportedReason ?? "Replay unavailable";
  if (!record.replay.freshExecution) return "Replay report, not fresh execution";
  return record.replay.trajectoryPath ? "Replay available" : "Replay metadata pending";
}

function timelineFacts(record: RunRecord): RunTimelineFact[] {
  const budget = budgetPanel(record);
  return [
    { label: "Route", value: `${record.route.source}:${record.route.selectedProfile ?? "unknown"}` },
    { label: "Workflow", value: `${record.workflow?.mode ?? "unknown"}:${record.workflow?.exitReason ?? record.execution.exitReason}` },
    { label: "Budget", value: budget.exceeded ? "exceeded" : `${budget.iterations.label} iterations` },
    { label: "Iterations", value: String(record.execution.iterations) },
    { label: "Tools", value: `${record.execution.successfulToolCalls}/${record.execution.totalToolCalls}` },
    { label: "Checkpoints", value: `${record.execution.passedCheckpoints}/${record.execution.checkpointCount}` },
    { label: "Events", value: String(Object.values(record.execution.eventCounts).reduce((sum, count) => sum + count, 0)) },
  ];
}

function budgetPanel(record: RunRecord): RunBudgetPanel {
  const usage = record.workflow?.budgetUsage;
  const budget = record.workflow?.budget;
  const durationLimit = budget?.timeoutMs;
  return {
    exceeded: record.workflow?.budgetExceeded === true || record.workflow?.exitReason === "budget_exceeded",
    childRuns: budgetMetric(usage?.childRuns ?? record.workflow?.childRuns ?? 0, budget?.maxChildRuns),
    iterations: budgetMetric(usage?.iterations ?? record.execution.iterations, budget?.maxAggregateIterations ?? budget?.maxIterationsPerRun),
    toolCalls: budgetMetric(usage?.toolCalls ?? record.execution.totalToolCalls, budget?.maxAggregateToolCalls ?? budget?.maxToolCallsPerRun),
    tokenEstimate: budgetMetric(usage?.tokenEstimate ?? 0, budget?.maxAggregateTokenEstimate ?? budget?.maxTokenEstimatePerRun),
    providerUsage: providerUsagePanel(usage?.providerUsage),
    recoveryAttempts: budgetMetric(usage?.recoveryAttempts ?? 0, budget?.maxRecoveryAttemptsPerRun),
    durationMs: budgetMetric(usage?.durationMs ?? record.execution.durationMs, durationLimit),
  };
}

function budgetMetric(used: number, limit: number | undefined): RunBudgetMetric {
  const numericLimit = typeof limit === "number" && Number.isFinite(limit) ? limit : null;
  return {
    used,
    limit: numericLimit,
    label: numericLimit === null ? `${used}/?` : `${used}/${numericLimit}`,
  };
}

function providerUsagePanel(usage: ProviderUsageSummary | undefined): RunProviderUsagePanel {
  if (!usage) {
    return {
      totalTokens: 0,
      tokenLabel: "Not reported",
      costLabel: "Not reported",
      costStatus: "not_reported",
    };
  }

  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    totalTokens: usage.totalTokens,
    tokenLabel: `${usage.totalTokens} provider tokens`,
    costUsd: usage.costUsd,
    costLabel: usage.costStatus === "priced" ? `$${usage.costUsd.toFixed(6)}` : "Pricing not configured",
    costStatus: usage.costStatus,
  };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordOfNumbers(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

function successDefValue(value: unknown): RunRecord["task"]["successDef"] | undefined {
  const source = objectValue(value);
  const goal = source.goal;
  const assertionCount = source.assertionCount;
  if (typeof goal !== "string" || typeof assertionCount !== "number") return undefined;
  return { goal, assertionCount };
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

function reviewValue(value: unknown): ReviewSummary {
  const source = objectValue(value);
  const rubric = objectValue(source.rubric);
  return {
    reviewerRunId: stringValue(source.reviewerRunId, "unknown-reviewer"),
    rubric: {
      taskGoal: stringValue(rubric.taskGoal, "Unknown review task"),
      successCriteria: stringArray(rubric.successCriteria),
      requiredEvidence: stringArray(rubric.requiredEvidence),
      forbiddenClaims: stringArray(rubric.forbiddenClaims),
      falseConfidenceRisks: stringArray(rubric.falseConfidenceRisks),
      blockingIssueRules: stringArray(rubric.blockingIssueRules),
    },
    issues: Array.isArray(source.issues) ? source.issues.map(reviewIssueValue) : [],
  };
}

function reviewIssueValue(value: unknown): ReviewSummary["issues"][number] {
  const source = objectValue(value);
  const evidenceKind = source.evidenceKind === "assertion" ||
    source.evidenceKind === "policy" ||
    source.evidenceKind === "budget" ||
    source.evidenceKind === "child_result"
    ? source.evidenceKind
    : "checkpoint";
  return {
    severity: source.severity === "non_blocking" ? "non_blocking" : "blocking",
    sourceChildRunId: stringValue(source.sourceChildRunId, "unknown-reviewer"),
    message: stringValue(source.message, "Review issue reported."),
    evidenceKind,
    ...(typeof source.assertion === "string" ? { assertion: source.assertion } : {}),
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

function emptyAutonomy(): AutonomySummary {
  return { outcome: "completed_without_escalation", repairAttempts: [], escalations: [] };
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

function fallbackProofBoundaryForRecord(record: Pick<RunRecord, "evidence" | "automation" | "replay" | "failures">): ProofBoundary {
  return normalizeProofBoundary({
    proven: record.evidence.sources.length > 0 && record.evidence.passed > 0
      ? record.evidence.sources.map((source) => `Evidence source passed: ${source}`)
      : [],
    notProven: [
      "External production health is not proven by this run.",
      ...(record.automation?.doesNotProve ?? []),
      ...(record.replay.freshExecution ? [] : ["Historical replay does not prove fresh execution."]),
    ],
    assumptions: [
      ...(record.automation ? [`Automation scope: ${record.automation.scope}`] : []),
      "Final response is a communication artifact, not proof.",
    ],
    evidenceGaps: [
      ...(record.evidence.status === "not_checked" ? ["No verification evidence was checked."] : []),
      ...(record.evidence.status === "insufficient_evidence" ? ["Evidence is insufficient for trusted success."] : []),
      ...record.evidence.blocking,
      ...record.failures.map((failure) => failure.message),
    ],
  });
}

function normalizeProofBoundary(boundary: ProofBoundary): ProofBoundary {
  return {
    proven: uniqueNonEmpty(boundary.proven),
    notProven: uniqueNonEmpty(boundary.notProven),
    assumptions: uniqueNonEmpty(boundary.assumptions),
    evidenceGaps: uniqueNonEmpty(boundary.evidenceGaps),
  };
}

function uniqueNonEmpty(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function statusValue(value: unknown): string {
  const allowed = new Set(["created", "routed", "running", "awaiting_approval", "verifying", "succeeded", "failed", "degraded", "cancelled", "no_op"]);
  return typeof value === "string" && allowed.has(value) ? value : "unknown";
}

function taskSourceValue(value: unknown): RunRecord["task"]["source"] {
  const allowed = new Set(["cli", "web", "eval", "replay", "automation", "unknown"]);
  return typeof value === "string" && allowed.has(value) ? value as RunRecord["task"]["source"] : "unknown";
}

function routeSourceValue(value: unknown): RunRecord["route"]["source"] {
  const allowed = new Set(["explicit", "rule", "skill-match", "llm", "guard", "unknown"]);
  return typeof value === "string" && allowed.has(value) ? value as RunRecord["route"]["source"] : "unknown";
}

function evidenceStatusValue(value: unknown): RunRecord["evidence"]["status"] {
  const allowed = new Set(["passed", "failed", "not_checked", "insufficient_evidence"]);
  return typeof value === "string" && allowed.has(value) ? value as RunRecord["evidence"]["status"] : "not_checked";
}
