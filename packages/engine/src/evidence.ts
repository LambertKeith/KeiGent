import type { ApprovalDecision } from "./tools/types.js";
import type { Trajectory, TrajectoryStep } from "./types.js";
import { redactObject, redactText } from "./redaction.js";

export interface ToolCallEvidence {
  iteration: number;
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolResult: string;
  succeeded: boolean;
}

export interface CheckpointEvidence {
  iteration: number;
  checkpointDesc?: string;
  passed: boolean;
  evidence: string;
  visibleText?: string;
  url?: string;
}

export interface EvidenceBundle {
  finalResponse: string;
  textOutputs: string[];
  toolCalls: ToolCallEvidence[];
  approvals: ApprovalDecision[];
  checkpoints: CheckpointEvidence[];
}

export function buildEvidenceBundle(trajectory: Trajectory): EvidenceBundle {
  const toolCalls: ToolCallEvidence[] = [];
  const approvals: ApprovalDecision[] = [];
  const checkpoints: CheckpointEvidence[] = [];
  const textOutputs: string[] = [];

  for (const step of trajectory.steps) {
    switch (step.kind) {
      case "tool_call":
        if (step.toolName) toolCalls.push(toolEvidence(step));
        break;
      case "approval":
        if (step.approval) approvals.push(redactApproval(step.approval));
        break;
      case "checkpoint":
        checkpoints.push({
          iteration: step.iteration,
          checkpointDesc: step.checkpointDesc,
          passed: step.verdictPassed === true,
          evidence: redactText(step.verdictEvidence ?? ""),
          visibleText: step.snapshot?.visibleText ? redactText(step.snapshot.visibleText) : undefined,
          url: step.snapshot?.url,
        });
        break;
      case "text_output":
        if (step.text) textOutputs.push(redactText(step.text));
        break;
      case "error":
        break;
    }
  }

  return {
    finalResponse: redactText(trajectory.finalResponse),
    textOutputs,
    toolCalls,
    approvals,
    checkpoints,
  };
}

export function countSuccessfulToolCalls(bundle: EvidenceBundle, toolName: string): number {
  return bundle.toolCalls.filter((tool) => tool.toolName === toolName && tool.succeeded).length;
}

export function countPassedCheckpoints(bundle: EvidenceBundle): number {
  return bundle.checkpoints.filter((checkpoint) => checkpoint.passed).length;
}

export function hasApprovedScope(bundle: EvidenceBundle, scope: string): boolean {
  return bundle.approvals.some((approval) => {
    const request = approval.request;
    return approval.approved && (request.toolName === scope || request.targetResource.includes(scope));
  });
}

function toolEvidence(step: TrajectoryStep): ToolCallEvidence {
  return {
    iteration: step.iteration,
    toolName: step.toolName ?? "unknown",
    toolArgs: redactObject(step.toolArgs ?? {}),
    toolResult: redactText(step.toolResult ?? ""),
    succeeded: step.toolSucceeded === true,
  };
}

function redactApproval(approval: ApprovalDecision): ApprovalDecision {
  return {
    ...approval,
    request: {
      ...approval.request,
      args: redactObject(approval.request.args),
    },
  };
}
