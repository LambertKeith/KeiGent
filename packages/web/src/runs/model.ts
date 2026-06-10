import type { RunRecord } from "@keigent/engine";
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

export interface RunRecordDetailView {
  summary: RunRecordListItem;
  evidence: RunEvidencePanel;
  risk: RunRiskPanel;
  replay: RunReplayPanel;
  approvals: Array<{
    toolName: string;
    approved: boolean;
    riskLevel: string;
    targetResource: string;
  }>;
  artifacts: Array<{ kind: string; path: string }>;
  failures: Array<{ code: string; layer: string; message: string; nextAction: string }>;
  timelineFacts: RunTimelineFact[];
  rawJson: string;
}

export interface RunRecordCollectionView {
  empty: boolean;
  emptyMessage?: string;
  runs: RunRecordListItem[];
}

export function normalizeRunRecord(record: RunRecord): RunRecordDetailView {
  const summary = listItemFor(record);
  return {
    summary,
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
    replay: {
      supported: record.replay.supported,
      freshExecution: record.replay.freshExecution,
      ...(record.replay.trajectoryPath ? { trajectoryPath: redactText(record.replay.trajectoryPath) } : {}),
      ...(record.replay.latestReplayReportId ? { latestReplayReportId: redactText(record.replay.latestReplayReportId) } : {}),
      label: replayLabel(record),
    },
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
    timelineFacts: timelineFacts(record),
    rawJson: JSON.stringify(redactObject(record), null, 2),
  };
}

export function summarizeRunRecords(records: RunRecord[]): RunRecordCollectionView {
  if (records.length === 0) {
    return { empty: true, emptyMessage: "No run records saved", runs: [] };
  }
  return {
    empty: false,
    runs: records
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
    approvalRequired: record.risk.approvalRequired,
    replayAvailable: record.replay.supported && Boolean(record.replay.trajectoryPath),
  };
}

function evidenceLabel(record: RunRecord): string {
  if (record.evidence.total === 0) return "No evidence checked";
  return `${record.evidence.passed}/${record.evidence.total} evidence passed`;
}

function riskLabel(record: RunRecord): string {
  const approval = record.risk.approvalRequired ? "approval required" : "no approval";
  return `${record.risk.highestRiskLevel}, ${approval}`;
}

function replayLabel(record: RunRecord): string {
  if (!record.replay.supported) return record.replay.unsupportedReason ?? "Replay unavailable";
  if (!record.replay.freshExecution) return "Replay report, not fresh execution";
  return record.replay.trajectoryPath ? "Replay available" : "Replay metadata pending";
}

function timelineFacts(record: RunRecord): RunTimelineFact[] {
  return [
    { label: "Route", value: `${record.route.source}:${record.route.selectedProfile ?? "unknown"}` },
    { label: "Workflow", value: `${record.workflow?.mode ?? "unknown"}:${record.workflow?.exitReason ?? record.execution.exitReason}` },
    { label: "Iterations", value: String(record.execution.iterations) },
    { label: "Tools", value: `${record.execution.successfulToolCalls}/${record.execution.totalToolCalls}` },
    { label: "Checkpoints", value: `${record.execution.passedCheckpoints}/${record.execution.checkpointCount}` },
    { label: "Events", value: String(Object.values(record.execution.eventCounts).reduce((sum, count) => sum + count, 0)) },
  ];
}
