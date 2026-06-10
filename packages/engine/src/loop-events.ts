import { redactObject, redactText } from "./redaction.js";
import type { ExitReason, ProgressEvent } from "./types.js";
import type { EscalationReason, WorkflowEvent, WorkflowExitReason } from "./workflow/types.js";

export type LoopEventType =
  | "run_created"
  | "route_decided"
  | "skill_matched"
  | "iteration_started"
  | "tool_requested"
  | "tool_completed"
  | "evidence_collected"
  | "assertion_checked"
  | "repair_started"
  | "escalation_decided"
  | "run_succeeded"
  | "run_failed"
  | "run_degraded"
  | "unknown";

export interface LoopEvent {
  type: LoopEventType;
  iteration?: number;
  toolName?: string;
  status?: "requested" | "succeeded" | "failed" | "pending" | "approved" | "denied";
  escalationReason?: EscalationReason;
  approvalStatus?: "approved" | "denied";
  rawKind?: string;
  message?: string;
  payload?: Record<string, unknown>;
}

export function loopEventFromProgress(event: ProgressEvent): LoopEvent {
  switch (event.kind) {
    case "profile_selected":
      return {
        type: "route_decided",
        status: "succeeded",
        message: event.rationale,
        payload: compactPayload({
          profile: event.profile,
          via: event.via,
          ruleId: event.ruleId,
          signals: event.signals,
          guardApplied: event.guardApplied,
          unguardedProfile: event.unguardedProfile,
        }),
      };
    case "skills_matched":
      return {
        type: "skill_matched",
        status: "succeeded",
        payload: compactPayload({ skills: event.skills, explanations: event.explanations }),
      };
    case "iteration_start":
      return { type: "iteration_started", iteration: event.iteration, status: "succeeded" };
    case "tool_call":
      return {
        type: "tool_requested",
        iteration: event.iteration,
        toolName: event.toolName,
        status: "requested",
        payload: compactPayload(event.args),
      };
    case "tool_result":
      return {
        type: "tool_completed",
        iteration: event.iteration,
        toolName: event.toolName,
        status: event.succeeded ? "succeeded" : "failed",
        message: redactText(event.result),
      };
    case "approval":
      return {
        type: event.approved ? "tool_completed" : "escalation_decided",
        iteration: event.iteration,
        toolName: event.request.toolName,
        status: event.approved ? "approved" : "denied",
        approvalStatus: event.approved ? "approved" : "denied",
        escalationReason: event.approved ? undefined : "permission_required",
        message: event.approved ? "Approval granted" : "Approval denied",
        payload: compactPayload({ request: event.request, decidedAt: event.decidedAt }),
      };
    case "text":
      return {
        type: "evidence_collected",
        iteration: event.iteration,
        status: "succeeded",
        message: redactText(event.text),
      };
    case "checkpoint":
      return {
        type: "evidence_collected",
        iteration: event.iteration,
        status: "pending",
        message: redactText(event.desc),
      };
    case "verdict":
      return {
        type: "assertion_checked",
        iteration: event.iteration,
        status: event.passed ? "succeeded" : "failed",
        message: redactText(event.evidence),
      };
    case "recovery":
      return event.decision === "repair"
        ? {
            type: "repair_started",
            iteration: event.iteration,
            status: "pending",
            message: redactText(event.hint ?? event.reason ?? "repair started"),
          }
        : {
            type: event.decision === "escalate" ? "escalation_decided" : "run_degraded",
            iteration: event.iteration,
            status: "failed",
            escalationReason: event.decision === "escalate" ? "evidence_insufficient_after_retry" : undefined,
            message: redactText(event.reason ?? event.hint ?? event.decision),
          };
    case "escalate":
      return {
        type: "escalation_decided",
        status: "failed",
        escalationReason: "goal_ambiguity_blocking",
        message: redactText(event.reason),
      };
    case "done":
      return {
        type: terminalLoopEventType(event.exitReason),
        status: event.exitReason === "success" ? "succeeded" : "failed",
        message: redactText(event.finalResponse),
        payload: compactPayload(event.failure ? { failure: event.failure } : {}),
      };
  }
}

export function loopEventsFromWorkflow(event: WorkflowEvent): LoopEvent[] {
  switch (event.kind) {
    case "workflow_start":
      return [{ type: "run_created", status: "succeeded", message: event.goal, payload: compactPayload({ workflowId: event.workflowId, mode: event.mode }) }];
    case "child_start":
      return [{ type: "run_created", status: "succeeded", payload: compactPayload({ workflowId: event.workflowId, childRunId: event.childRunId, role: event.role }) }];
    case "child_event":
      return [loopEventFromProgress(event.event)];
    case "child_done":
      return [{
        type: event.exitReason === "success" ? "run_succeeded" : "run_failed",
        status: event.exitReason === "success" ? "succeeded" : "failed",
        payload: compactPayload({ workflowId: event.workflowId, childRunId: event.childRunId, exitReason: event.exitReason }),
      }];
    case "workflow_verdict":
      return [{
        type: "assertion_checked",
        status: event.passed ? "succeeded" : "failed",
        payload: compactPayload({ workflowId: event.workflowId, evidence: event.evidence }),
      }];
    case "workflow_done":
      return [{
        type: workflowTerminalLoopEventType(event.exitReason),
        status: event.exitReason === "success" ? "succeeded" : "failed",
        payload: compactPayload({ workflowId: event.workflowId, exitReason: event.exitReason, failure: event.failure }),
      }];
  }
}

export function loopEventFromUnknown(event: unknown): LoopEvent {
  return {
    type: "unknown",
    rawKind: rawKind(event),
    payload: compactPayload(event),
  };
}

function terminalLoopEventType(exitReason: ExitReason): LoopEventType {
  if (exitReason === "success") return "run_succeeded";
  if (exitReason === "budget_exceeded" || exitReason === "max_iterations" || exitReason === "escalated") return "run_degraded";
  return "run_failed";
}

function workflowTerminalLoopEventType(exitReason: WorkflowExitReason): LoopEventType {
  if (exitReason === "success") return "run_succeeded";
  if (exitReason === "budget_exceeded" || exitReason === "timeout" || exitReason === "max_iterations" || exitReason === "child_escalated") return "run_degraded";
  return "run_failed";
}

function compactPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return redactObject(value as Record<string, unknown>);
}

function rawKind(value: unknown): string {
  if (!value || typeof value !== "object" || !("kind" in value)) return "unknown";
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : "unknown";
}
