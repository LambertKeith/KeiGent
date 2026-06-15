import type { ApprovalDecision } from "./tools/types.js";
import type { EvidenceSource } from "./tools/types.js";
import type { Trajectory, TrajectoryStep } from "./types.js";
import { redactObject, redactText } from "./redaction.js";

export interface ToolCallEvidence {
  iteration: number;
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolResult: string;
  succeeded: boolean;
  sources: EvidenceSource[];
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
  sources: EvidenceSource[];
}

export function buildEvidenceBundle(trajectory: Trajectory): EvidenceBundle {
  const toolCalls: ToolCallEvidence[] = [];
  const approvals: ApprovalDecision[] = [];
  const checkpoints: CheckpointEvidence[] = [];
  const textOutputs: string[] = [];
  const sources: EvidenceSource[] = [];

  for (const step of trajectory.steps) {
    switch (step.kind) {
      case "tool_call":
        if (step.toolName) {
          const evidence = toolEvidence(step);
          toolCalls.push(evidence);
          sources.push(...evidence.sources);
        }
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
    sources,
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

export function hasCollectedSource(bundle: EvidenceBundle, connector: string, refIncludes?: string): EvidenceSource | undefined {
  return bundle.sources.find((source) => {
    if (source.connector !== connector) return false;
    return refIncludes ? source.ref.includes(refIncludes) : true;
  });
}

function toolEvidence(step: TrajectoryStep): ToolCallEvidence {
  return {
    iteration: step.iteration,
    toolName: step.toolName ?? "unknown",
    toolArgs: redactObject(step.toolArgs ?? {}),
    toolResult: redactText(step.toolResult ?? ""),
    succeeded: step.toolSucceeded === true,
    sources: (step.toolSources ?? []).map((source) => ({
      kind: source.kind,
      connector: redactText(source.connector),
      ref: redactText(source.ref),
    })),
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
