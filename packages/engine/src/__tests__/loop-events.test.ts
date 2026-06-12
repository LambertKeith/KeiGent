import { describe, expect, it } from "vitest";
import {
  loopEventFromProgress,
  loopEventFromUnknown,
  loopEventsFromWorkflow,
  type LoopEvent,
} from "../loop-events.js";
import type { ApprovalRequest } from "../tools/types.js";
import type { WorkflowEvent } from "../workflow/types.js";

const approvalRequest: ApprovalRequest = {
  toolName: "shell",
  args: { command: "deploy" },
  permission: "dangerous",
  riskLevel: "R5",
  sideEffect: "external",
  reversible: false,
  action: "Run shell",
  targetResource: "production",
  evidenceRequired: ["approval receipt"],
  exposesSecrets: false,
};

describe("loop event protocol", () => {
  it("maps tool request and completion events without conflating attempted and succeeded", () => {
    expect(loopEventFromProgress({ kind: "tool_call", iteration: 1, toolName: "file_read", args: { path: "README.md" } })).toMatchObject({
      type: "tool_requested",
      iteration: 1,
      toolName: "file_read",
      status: "requested",
    });

    expect(loopEventFromProgress({ kind: "tool_result", iteration: 1, toolName: "file_read", result: "ok", succeeded: true })).toMatchObject({
      type: "tool_completed",
      iteration: 1,
      toolName: "file_read",
      status: "succeeded",
    });
  });

  it("maps approval denial to structured escalation", () => {
    expect(loopEventFromProgress({
      kind: "approval",
      iteration: 2,
      request: approvalRequest,
      approved: false,
      decidedAt: "2026-06-10T00:00:00.000Z",
    })).toMatchObject({
      type: "escalation_decided",
      iteration: 2,
      escalationReason: "permission_required",
      approvalStatus: "denied",
      toolName: "shell",
    });
  });

  it("maps repair recovery and terminal outcomes", () => {
    expect(loopEventFromProgress({ kind: "recovery", iteration: 3, decision: "repair", hint: "collect evidence" })).toMatchObject({
      type: "repair_started",
      iteration: 3,
      message: "collect evidence",
    });

    expect(loopEventFromProgress({ kind: "done", exitReason: "success", finalResponse: "ok" })).toMatchObject({
      type: "run_succeeded",
      status: "succeeded",
    });

    expect(loopEventFromProgress({ kind: "done", exitReason: "budget_exceeded", finalResponse: "partial" })).toMatchObject({
      type: "run_degraded",
      status: "failed",
    });
  });

  it("unwraps workflow child events and keeps workflow terminal state", () => {
    const workflowEvents: WorkflowEvent[] = [
      { kind: "workflow_start", workflowId: "wf", mode: "single-loop", goal: "Run" },
      { kind: "child_event", workflowId: "wf", childRunId: "child", event: { kind: "iteration_start", iteration: 1 } },
      { kind: "workflow_done", workflowId: "wf", exitReason: "verified_failure" },
    ];

    expect(workflowEvents.flatMap(loopEventsFromWorkflow).map((event: LoopEvent) => event.type)).toEqual([
      "run_created",
      "iteration_started",
      "run_failed",
    ]);
  });

  it("normalizes unknown event shapes without throwing", () => {
    expect(loopEventFromUnknown({ kind: "future_event", payload: { apiKey: "secret" } })).toMatchObject({
      type: "unknown",
      rawKind: "future_event",
    });
  });
});
