import { describe, expect, it } from "vitest";
import { buildNoOpRunRecord, buildRunRecordFromWorkflowResult, proofBoundaryForRunRecord } from "../lib.js";
import type { WorkflowResult } from "../workflow/types.js";

describe("proof boundary", () => {
  it("surfaces automation scope limits as not-proven claims", () => {
    const record = buildNoOpRunRecord({
      id: "run_noop",
      createdAt: "2026-06-10T00:00:00.000Z",
      goal: "Triage recent failed runs",
      trigger: "manual",
      scope: "last 20 runs",
      noOpReason: "No triage candidates found.",
      doesNotProve: ["No hidden failures outside automation scope."],
    });

    expect(proofBoundaryForRunRecord(record)).toMatchObject({
      notProven: expect.arrayContaining(["No hidden failures outside automation scope."]),
      evidenceGaps: expect.arrayContaining(["No verification evidence was checked."]),
    });
  });

  it("keeps replay and insufficient evidence out of trusted success claims", () => {
    const record = buildRunRecordFromWorkflowResult(workflowWithoutEvidence(), {
      id: "run_replay",
      replay: { freshExecution: false },
    });

    expect(record.proofBoundary.notProven).toContain("Historical replay does not prove fresh execution.");
    expect(record.proofBoundary.evidenceGaps).toContain("No verification evidence was checked.");
  });
});

function workflowWithoutEvidence(): WorkflowResult {
  const task = { goal: "Report status", profile: "auto" };
  const autonomy = {
    outcome: "completed_without_escalation" as const,
    repairAttempts: [],
    escalations: [],
  };
  const loop = {
    exitReason: "success" as const,
    finalResponse: "done",
    iterations: 1,
    checkpointsPassed: 0,
    totalToolCalls: 0,
    trajectory: {
      task,
      profile: "convergent-exec",
      exitReason: "success" as const,
      steps: [],
      finalResponse: "done",
      durationMs: 1,
      skillsUsed: [],
    },
  };
  return {
    workflowId: "wf_no_evidence",
    mode: "single-loop",
    exitReason: "success",
    finalResponse: "done",
    childRuns: [{ id: "wf_no_evidence:worker-1", role: "worker", result: loop, trajectory: loop.trajectory }],
    evidence: [],
    budget: { maxChildRuns: 1, maxIterationsPerRun: 1 },
    budgetUsage: { childRuns: 1, iterations: 1, toolCalls: 0, recoveryAttempts: 0, checkpointsPassed: 0, durationMs: 1 },
    autonomy,
    durationMs: 1,
    trajectory: {
      schemaVersion: 1,
      workflowId: "wf_no_evidence",
      mode: "single-loop",
      goal: "Report status",
      rootTask: task,
      startedAt: "2026-06-10T00:00:00.000Z",
      durationMs: 1,
      exitReason: "success",
      finalResponse: "done",
      budget: { maxChildRuns: 1, maxIterationsPerRun: 1 },
      budgetUsage: { childRuns: 1, iterations: 1, toolCalls: 0, recoveryAttempts: 0, checkpointsPassed: 0, durationMs: 1 },
      autonomy,
      evidence: [],
      events: [],
      childRuns: [{ id: "wf_no_evidence:worker-1", role: "worker", result: loop, trajectory: loop.trajectory }],
    },
  };
}
