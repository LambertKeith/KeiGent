import type { NormalizeRunOptions } from "../conversation/normalize.js";
import type { WebRunAuditHandoff } from "../conversation/web-run.js";
import { normalizeRunRecord, type RunRecordDetailView } from "../runs/model.js";

export type ChatRunStatus =
  | "api_unavailable"
  | "idle"
  | "starting"
  | "running"
  | "waiting_for_approval"
  | "needs_user_action"
  | "succeeded"
  | "failed"
  | "degraded"
  | "needs_review";

export interface ChatWorkbenchInput {
  apiEnabled: boolean;
  run: NormalizeRunOptions;
  error?: string;
  auditHandoff?: WebRunAuditHandoff;
  runRecord?: unknown;
}

export interface ChatWorkbenchView extends ChatWorkbenchInput {
  status: ChatRunStatus;
  statusLabel: string;
  resultText?: string;
  nextAction: string;
  evidenceSummary: string;
}

export function buildChatWorkbenchView(input: ChatWorkbenchInput): ChatWorkbenchView {
  const lastDone = [...input.run.events].reverse().find((event) => event.kind === "done");
  const runDetail = input.runRecord ? normalizeRunRecord(input.runRecord) : undefined;
  const status = statusFor(input, runDetail, lastDone?.exitReason);
  const resultText = lastDone?.finalResponse;

  return {
    ...input,
    status,
    statusLabel: statusLabel(status),
    ...(resultText ? { resultText } : {}),
    nextAction: nextActionFor(status, Boolean(input.auditHandoff), input.error),
    evidenceSummary: evidenceSummary(input, runDetail),
  };
}

function statusFor(input: ChatWorkbenchInput, runDetail?: RunRecordDetailView, exitReason?: string): ChatRunStatus {
  if (!input.apiEnabled) return "api_unavailable";
  if (runDetail) {
    if (runDetail.summary.status === "awaiting_approval") return "needs_user_action";
    if (runDetail.trust.label === "insufficient-evidence" || runDetail.proofBoundary.evidenceGaps.length > 0) return "needs_review";
    if (runDetail.summary.status === "degraded") return "degraded";
    if (runDetail.summary.status === "failed" || runDetail.summary.status === "cancelled") return "failed";
    if (runDetail.summary.status === "succeeded" && runDetail.evidence.status === "passed") return "succeeded";
  }
  if (exitReason) {
    if (exitReason === "success") return "needs_review";
    if (exitReason === "escalated" || exitReason === "child_escalated") return "needs_review";
    if (exitReason === "budget_exceeded" || exitReason === "max_iterations") return "degraded";
    return "failed";
  }
  if (input.run.mode === "live" && input.run.task.goal.trim().length > 0 && input.run.events.length === 0) {
    return "starting";
  }
  if (input.run.events.some((event) => event.kind === "approval" && !event.approved)) return "needs_user_action";
  if (input.run.events.some((event) => event.kind === "approval_request")) return "waiting_for_approval";
  if (input.run.mode === "live" && input.run.events.length > 0) return "running";
  return "idle";
}

function statusLabel(status: ChatRunStatus): string {
  switch (status) {
    case "api_unavailable":
      return "Local API not connected";
    case "idle":
      return "Ready";
    case "starting":
      return "Starting";
    case "running":
      return "Running";
    case "waiting_for_approval":
      return "Waiting for approval";
    case "needs_user_action":
      return "Needs user action";
    case "succeeded":
      return "Succeeded";
    case "failed":
      return "Failed";
    case "degraded":
      return "Needs review";
    case "needs_review":
      return "Needs review";
  }
}

function nextActionFor(status: ChatRunStatus, hasHandoff: boolean, error?: string): string {
  if (status === "api_unavailable") return "Start the local Web API.";
  if (error) return "Fix the error and retry.";
  if (status === "starting" || status === "running") return "Wait for the run to finish or open details.";
  if (status === "waiting_for_approval" || status === "needs_user_action") return "Review the requested action before continuing.";
  if (hasHandoff) return "Open Run Detail to review evidence.";
  if (status === "idle") return "Enter a task and run it.";
  if (status === "failed") return "Review the failure and retry with a narrower task.";
  if (status === "degraded" || status === "needs_review") return "Open Run Detail before accepting the result.";
  return "Review the result.";
}

function evidenceSummary(input: ChatWorkbenchInput, runDetail?: RunRecordDetailView): string {
  if (runDetail) {
    const gaps = runDetail.proofBoundary.evidenceGaps.length > 0
      ? ` Evidence gaps: ${runDetail.proofBoundary.evidenceGaps.join("; ")}.`
      : "";
    return `RunRecord evidence: ${runDetail.evidence.status} (${runDetail.evidence.passed}/${runDetail.evidence.total} passed). Trust: ${runDetail.trust.label}.${gaps} Next action: ${runDetail.nextAction.label}`;
  }
  if (!input.run.events.length) return "No run evidence yet.";
  if (input.auditHandoff) {
    return `Live summary saved to ${input.auditHandoff.recordId}. RunRecord evidence is still loading; open Run Detail for full evidence, risk, approvals, and replay.`;
  }
  if (input.run.events.some((event) => event.kind === "done" && event.exitReason === "success")) {
    return "RunRecord evidence is not available yet. Treat the final response as unverified until evidence, risk, approvals, and replay are reviewed.";
  }
  const checkpoints = input.run.events.filter((event) => event.kind === "checkpoint").length;
  const verdicts = input.run.events.filter((event) => event.kind === "verdict").length;
  const tools = input.run.events.filter((event) => event.kind === "tool_call").length;
  return `${tools} tool event(s), ${checkpoints} checkpoint(s), ${verdicts} verdict(s) observed in this live session.`;
}
