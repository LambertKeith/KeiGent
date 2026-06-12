import type { TrajectoryStep } from "../types.js";
import type {
  AutonomySummary,
  ChildRunResult,
  EscalationDecision,
  RepairAttemptSummary,
  WorkflowExitReason,
  WorkflowEvidence,
} from "./types.js";

export interface BuildAutonomySummaryInput {
  exitReason: WorkflowExitReason;
  childRuns: ChildRunResult[];
  evidence: WorkflowEvidence[];
}

export function buildAutonomySummary(input: BuildAutonomySummaryInput): AutonomySummary {
  const repairAttempts = collectRepairAttempts(input);
  const escalations = collectEscalations(input.exitReason, repairAttempts);

  return {
    outcome: outcomeFor(input.exitReason, repairAttempts, escalations),
    repairAttempts,
    escalations,
  };
}

export function emptyAutonomySummary(): AutonomySummary {
  return {
    outcome: "completed_without_escalation",
    repairAttempts: [],
    escalations: [],
  };
}

function collectRepairAttempts(input: BuildAutonomySummaryInput): RepairAttemptSummary[] {
  const attempts: RepairAttemptSummary[] = [];
  for (const child of input.childRuns) {
    const steps = child.trajectory?.steps ?? [];
    for (const step of steps) {
      if (step.kind !== "recovery" || step.recovery?.decision !== "repair") continue;
      attempts.push({
        targetAssertion: targetAssertionFor(step, steps, input.evidence),
        reason: step.recovery.reason ?? step.recovery.hint ?? "repair requested",
        attempt: attempts.length + 1,
        finalVerdict: finalVerdictFor(step, steps, input.exitReason),
      });
    }
  }
  return attempts;
}

function targetAssertionFor(repair: TrajectoryStep, steps: TrajectoryStep[], evidence: WorkflowEvidence[]): string {
  const checkpoint = steps.find((step) =>
    step.kind === "checkpoint"
    && step.iteration >= repair.iteration
    && typeof step.checkpointDesc === "string"
    && step.checkpointDesc.trim().length > 0);
  if (checkpoint?.checkpointDesc) return checkpoint.checkpointDesc;

  const assertionEvidence = evidence.find((item) => item.assertion);
  if (assertionEvidence?.assertion) return assertionEvidence.assertion;

  const evidenceMessage = evidence.find((item) => item.message.trim().length > 0);
  if (evidenceMessage) return evidenceMessage.message;

  return repair.recovery?.hint ?? "unknown assertion";
}

function finalVerdictFor(repair: TrajectoryStep, steps: TrajectoryStep[], exitReason: WorkflowExitReason): RepairAttemptSummary["finalVerdict"] {
  if (exitReason === "budget_exceeded") return "budget_exhausted";
  const checkpoint = steps.find((step) =>
    step.kind === "checkpoint"
    && step.iteration >= repair.iteration
    && typeof step.verdictPassed === "boolean");
  if (checkpoint?.verdictPassed === true) return "passed";
  return "failed";
}

function collectEscalations(exitReason: WorkflowExitReason, repairAttempts: RepairAttemptSummary[]): EscalationDecision[] {
  if (exitReason === "verified_failure") {
    return [{
      reason: repairAttempts.length > 0 ? "evidence_insufficient_after_retry" : "acceptance_failed_after_repair",
      message: repairAttempts.length > 0
        ? "Evidence remained insufficient after repair."
        : "Acceptance verification failed.",
    }];
  }
  if (exitReason === "child_escalated") {
    return [{ reason: "goal_ambiguity_blocking", message: "Child run escalated before completion." }];
  }
  if (exitReason === "child_error") {
    return [{ reason: "external_dependency_blocked", message: "Child run ended with an error before verified completion." }];
  }
  return [];
}

function outcomeFor(
  exitReason: WorkflowExitReason,
  repairAttempts: RepairAttemptSummary[],
  escalations: EscalationDecision[],
): AutonomySummary["outcome"] {
  if (escalations.length > 0) return "escalated";
  if (exitReason === "success" && repairAttempts.some((attempt) => attempt.finalVerdict === "passed")) return "self_repaired";
  if (exitReason === "budget_exceeded" || exitReason === "timeout" || exitReason === "max_iterations") return "degraded_without_escalation";
  return "completed_without_escalation";
}
