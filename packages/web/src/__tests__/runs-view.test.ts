import { describe, expect, it } from "vitest";
import type { RunRecord } from "@keigent/engine";
import { normalizeRunRecord, summarizeRunRecords } from "../runs/model.js";

function runRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    schemaVersion: 1,
    id: "run_002",
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:01.000Z",
    status: "succeeded",
    task: {
      goal: "Create hello.txt",
      source: "cli",
      requestedProfile: "auto",
      resolvedProfile: "convergent-exec",
      requestedWorkflowMode: "verified-loop",
      resolvedWorkflowMode: "verified-loop",
    },
    route: {
      selectedProfile: "convergent-exec",
      source: "rule",
      ruleId: "skill_match",
      rationale: "matched file skill",
      matchedSkillIds: ["file-write"],
    },
    workflow: {
      id: "wf_002",
      mode: "verified-loop",
      exitReason: "success",
      childRuns: 1,
      budgetUsage: { childRuns: 1, iterations: 2, toolCalls: 1, checkpointsPassed: 1, durationMs: 20 },
    },
    execution: {
      iterations: 2,
      totalToolCalls: 1,
      successfulToolCalls: 1,
      failedToolCalls: 0,
      checkpointCount: 1,
      passedCheckpoints: 1,
      durationMs: 20,
      exitReason: "success",
      finalResponseSummary: "created",
      eventCounts: { tool_call: 1, checkpoint: 1 },
    },
    evidence: {
      status: "passed",
      total: 1,
      passed: 1,
      failed: 0,
      sources: ["checkpoint"],
      blocking: [],
    },
    risk: {
      highestRiskLevel: "R3",
      permissionClassesUsed: ["write"],
      sideEffectsAttempted: 1,
      sideEffectsSucceeded: 1,
      externalSideEffects: 0,
      irreversibleActions: 0,
      approvalRequired: true,
    },
    approvals: [{
      toolName: "file_write",
      approved: true,
      decidedAt: "2026-06-10T00:00:01.000Z",
      riskLevel: "R3",
      permission: "write",
      sideEffect: "local",
      reversible: true,
      targetResource: "workspace:hello.txt",
    }],
    failures: [],
    artifacts: [{ kind: "workflow_trajectory", path: "/tmp/workflow.json" }],
    replay: {
      supported: true,
      trajectoryPath: "/tmp/workflow.json",
      trajectorySchemaVersion: 1,
      freshExecution: true,
    },
    redaction: { applied: true, rawPayloadStored: false },
    ...overrides,
  };
}

describe("run record view model", () => {
  it("normalizes a RunRecord into summary, evidence, risk, and replay panels", () => {
    const view = normalizeRunRecord(runRecord());

    expect(view.summary).toMatchObject({
      id: "run_002",
      status: "succeeded",
      goal: "Create hello.txt",
      profile: "convergent-exec",
      workflowMode: "verified-loop",
      evidenceLabel: "1/1 evidence passed",
      riskLabel: "R3, approval required",
      replayAvailable: true,
    });
    expect(view.evidence).toMatchObject({ status: "passed", total: 1, passed: 1 });
    expect(view.risk).toMatchObject({ highestRiskLevel: "R3", approvalRequired: true, sideEffectsSucceeded: 1 });
    expect(view.replay).toMatchObject({ freshExecution: true, label: "Replay available" });
    expect(view.approvals).toEqual([expect.objectContaining({ toolName: "file_write", approved: true })]);
    expect(view.timelineFacts.map((fact) => fact.label)).toEqual(["Route", "Workflow", "Iterations", "Tools", "Checkpoints", "Events"]);
  });

  it("keeps replay reports visibly separate from fresh execution", () => {
    const view = normalizeRunRecord(runRecord({
      status: "succeeded",
      replay: {
        supported: true,
        trajectoryPath: "/tmp/replay.json",
        freshExecution: false,
        latestReplayReportId: "local-real-task-v1:replay-report",
      },
    }));

    expect(view.replay).toMatchObject({
      freshExecution: false,
      label: "Replay report, not fresh execution",
      latestReplayReportId: "local-real-task-v1:replay-report",
    });
  });

  it("summarizes saved run records newest first", () => {
    const collection = summarizeRunRecords([
      runRecord({ id: "run_001", createdAt: "2026-06-09T00:00:00.000Z" }),
      runRecord({ id: "run_003", createdAt: "2026-06-11T00:00:00.000Z" }),
    ]);

    expect(collection.empty).toBe(false);
    expect(collection.runs.map((run) => run.id)).toEqual(["run_003", "run_001"]);
    expect(summarizeRunRecords([])).toMatchObject({ empty: true, emptyMessage: "No run records saved" });
  });
});
