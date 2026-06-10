import type { RunRecord } from "./run-record.js";
import type { WorkflowResult } from "./workflow/types.js";

export interface ProofBoundary {
  proven: string[];
  notProven: string[];
  assumptions: string[];
  evidenceGaps: string[];
}

export function proofBoundaryForWorkflowResult(result: WorkflowResult): ProofBoundary {
  const proven = result.evidence
    .filter((item) => item.passed)
    .map((item) => `Evidence passed: ${item.message}`);
  const failedEvidence = result.evidence
    .filter((item) => !item.passed)
    .map((item) => `Evidence failed: ${item.message}`);

  return normalizeProofBoundary({
    proven,
    notProven: ["External production health is not proven by this run."],
    assumptions: ["Recorded workflow evidence reflects the completed child run state."],
    evidenceGaps: [
      ...(result.evidence.length === 0 ? ["No verification evidence was checked."] : []),
      ...failedEvidence,
      ...(result.exitReason === "success" ? [] : [`Workflow did not finish with success: ${result.exitReason}`]),
    ],
  });
}

export function proofBoundaryForRunRecord(record: Pick<RunRecord, "status" | "evidence" | "automation" | "replay" | "failures">): ProofBoundary {
  const proven = record.evidence.sources.length > 0 && record.evidence.passed > 0
    ? record.evidence.sources.map((source) => `Evidence source passed: ${source}`)
    : [];
  return normalizeProofBoundary({
    proven,
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

export function mergeProofBoundaries(items: ProofBoundary[]): ProofBoundary {
  return normalizeProofBoundary({
    proven: items.flatMap((item) => item.proven),
    notProven: items.flatMap((item) => item.notProven),
    assumptions: items.flatMap((item) => item.assumptions),
    evidenceGaps: items.flatMap((item) => item.evidenceGaps),
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
