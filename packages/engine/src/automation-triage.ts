import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redactObject, redactText } from "./redaction.js";
import { buildNoOpRunRecord, type RunRecord, type RunStoreError } from "./run-record.js";

export type AutomationTriageStatus = "no_op" | "attention_required";
export type AutomationTriageReason = "blocking_failure" | "review_needed" | "missing_evidence" | "stale_schema";

export interface AutomationTriageCandidate {
  runId: string;
  status: string;
  evidenceStatus: string;
  reason: AutomationTriageReason;
  blocking: string[];
  nextAction: string;
  schemaWarnings?: string[];
}

export interface AutomationTriageReport {
  kind: "local-run-triage";
  status: AutomationTriageStatus;
  scope: string;
  totalScanned: number;
  totalCandidates: number;
  sourceRunIds: string[];
  nextAction: string;
  candidates: AutomationTriageCandidate[];
  errors: RunStoreError[];
}

export interface BuildAutomationTriageReportOptions {
  scope: string;
  totalScanned: number;
  candidates: AutomationTriageCandidate[];
  errors: RunStoreError[];
}

export interface BuildAutomationTriageRunRecordOptions {
  id: string;
  reportPath: string;
  createdAt?: string;
}

export interface SaveAutomationTriageReportOptions {
  runsDir: string;
  runId: string;
}

export interface AutomationTriageTrajectory {
  schemaVersion: 1;
  kind: "automation-triage";
  runId: string;
  status: AutomationTriageStatus;
  scope: string;
  totalScanned: number;
  sourceRunIds: string[];
  steps: Array<{
    kind: "scan" | "candidate";
    runId?: string;
    reason?: AutomationTriageReason;
    message: string;
  }>;
  finalResponse: string;
}

const DOES_NOT_PROVE = ["No hidden failures outside this scope."];

export function buildAutomationTriageReport(options: BuildAutomationTriageReportOptions): AutomationTriageReport {
  const sourceRunIds = [...new Set(options.candidates.map((candidate) => candidate.runId))];
  const status = sourceRunIds.length === 0 ? "no_op" : "attention_required";
  return {
    kind: "local-run-triage",
    status,
    scope: options.scope,
    totalScanned: options.totalScanned,
    totalCandidates: options.candidates.length,
    sourceRunIds,
    nextAction: status === "no_op"
      ? "Review automation scope before treating no-op as health."
      : `Review ${options.candidates.length} triage candidates before retrying or accepting affected runs.`,
    candidates: options.candidates,
    errors: options.errors,
  };
}

export async function saveAutomationTriageReport(
  report: AutomationTriageReport,
  options: SaveAutomationTriageReportOptions,
): Promise<string> {
  const dir = join(options.runsDir, options.runId);
  const path = join(dir, "triage-report.json");
  await mkdir(dir, { recursive: true });
  await writeFile(path, `${JSON.stringify(redactObject(report), null, 2)}\n`, "utf8");
  return path;
}

export async function saveAutomationTriageTrajectory(
  report: AutomationTriageReport,
  options: SaveAutomationTriageReportOptions,
): Promise<string> {
  const dir = join(options.runsDir, options.runId);
  const path = join(dir, "trajectory.json");
  const trajectory: AutomationTriageTrajectory = {
    schemaVersion: 1,
    kind: "automation-triage",
    runId: options.runId,
    status: report.status,
    scope: report.scope,
    totalScanned: report.totalScanned,
    sourceRunIds: report.sourceRunIds,
    steps: [
      {
        kind: "scan",
        message: `Scanned ${report.totalScanned} RunRecords in scope ${report.scope}.`,
      },
      ...report.candidates.map((candidate) => ({
        kind: "candidate" as const,
        runId: candidate.runId,
        reason: candidate.reason,
        message: candidate.nextAction,
      })),
    ],
    finalResponse: report.status === "no_op"
      ? "No triage candidates found."
      : `Found ${report.totalCandidates} triage candidates.`,
  };
  await mkdir(dir, { recursive: true });
  await writeFile(path, `${JSON.stringify(redactObject(trajectory), null, 2)}\n`, "utf8");
  return path;
}

export function buildAutomationTriageRunRecord(
  report: AutomationTriageReport,
  options: BuildAutomationTriageRunRecordOptions & { trajectoryPath: string },
): RunRecord {
  const reportPath = redactText(options.reportPath);
  const trajectoryPath = redactText(options.trajectoryPath);
  const noOp = report.status === "no_op";
  const record = buildNoOpRunRecord({
    id: options.id,
    ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    goal: "Triage local run store",
    trigger: "manual",
    scope: report.scope,
    noOpReason: "No triage candidates found.",
    doesNotProve: DOES_NOT_PROVE,
  });

  record.automation = {
    trigger: "manual",
    scope: report.scope,
    ...(noOp ? { noOpReason: "No triage candidates found." } : {}),
    doesNotProve: DOES_NOT_PROVE,
    sourceRunIds: report.sourceRunIds,
  };
  record.route = {
    source: "rule",
    ruleId: "local_run_triage",
    rationale: "Classified recent local RunRecords using status, evidence, failure, and schema diagnostics.",
    matchedSkillIds: [],
  };
  record.artifacts.push({ kind: "triage_report", path: reportPath });
  record.artifacts.push({ kind: "trajectory", path: trajectoryPath });
  record.nextAction = report.nextAction;

  if (noOp) return record;

  record.status = "degraded";
  record.execution.exitReason = "attention_required";
  record.execution.finalResponseSummary = `Found ${report.totalCandidates} triage candidates.`;
  record.evidence = {
    status: "insufficient_evidence",
    total: report.totalCandidates,
    passed: 0,
    failed: report.totalCandidates,
    sources: ["run-store-triage"],
    blocking: report.candidates.map((candidate) => `${candidate.runId}: ${candidate.reason}`),
  };
  record.autonomy = {
    outcome: "degraded_without_escalation",
    repairAttempts: [],
    escalations: [],
  };
  record.proofBoundary = {
    proven: [
      `Scanned ${report.totalScanned} RunRecords inside the declared scope.`,
      `Identified ${report.totalCandidates} triage candidates.`,
    ],
    notProven: [
      ...DOES_NOT_PROVE,
      "Triage findings do not prove affected runs are resolved.",
    ],
    assumptions: [`Automation scope: ${report.scope}`],
    evidenceGaps: report.candidates.map((candidate) => `${candidate.runId}: ${candidate.reason}`),
  };
  record.replay = {
    supported: false,
    unsupportedReason: "Automation triage produced a report, not a replayable trajectory.",
    freshExecution: true,
  };
  return record;
}
