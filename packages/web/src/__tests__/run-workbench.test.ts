import { describe, expect, it } from "vitest";
import type { RunRecord } from "@keigent/engine";
import { buildRunWorkbenchView, renderRunWorkbench } from "../runs/workbench.js";

function record(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    schemaVersion: 1,
    id: "run_001",
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:01.000Z",
    status: "succeeded",
    task: {
      goal: "Create hello.txt with api_key=sk-secret123456",
      source: "cli",
      requestedProfile: "auto",
      resolvedProfile: "convergent-exec",
      requestedWorkflowMode: "verified-loop",
      resolvedWorkflowMode: "verified-loop",
      successDef: { goal: "File exists", assertionCount: 1 },
    },
    route: {
      selectedProfile: "convergent-exec",
      source: "rule",
      ruleId: "skill_match",
      rationale: "matched file-write",
      matchedSkillIds: ["file-write"],
    },
    workflow: {
      id: "wf_001",
      mode: "verified-loop",
      exitReason: "success",
      childRuns: 1,
      budget: {
        maxChildRuns: 1,
        maxIterationsPerRun: 3,
        maxAggregateIterations: 3,
        maxToolCallsPerRun: 5,
        maxAggregateToolCalls: 5,
        maxTokenEstimatePerRun: 8_000,
        maxAggregateTokenEstimate: 8_000,
        maxRecoveryAttemptsPerRun: 2,
        timeoutMs: 120_000,
      },
      budgetUsage: {
        childRuns: 1,
        iterations: 2,
        toolCalls: 1,
        tokenEstimate: 120,
        recoveryAttempts: 0,
        checkpointsPassed: 1,
        durationMs: 20,
      },
      budgetExceeded: false,
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
    skills: [{
      name: "file-write",
      reason: "matched route",
      injected: true,
      riskDelta: "R3",
      evalCoverage: ["real-world:file-write"],
    }],
    tools: [{
      name: "file_write",
      attempted: true,
      succeeded: true,
      permission: "write",
      riskLevel: "R3",
      sideEffect: "local",
      targetResource: "workspace:hello.txt",
    }],
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
    proofBoundary: {
      proven: ["Evidence passed: file exists"],
      notProven: ["External production health is not proven by this run."],
      assumptions: ["Local fixture evidence is representative for this run only."],
      evidenceGaps: [],
    },
    redaction: { applied: true, rawPayloadStored: false },
    ...overrides,
  };
}

describe("run workbench page", () => {
  it("selects the newest run by default and summarizes reviewer queues", () => {
    const view = buildRunWorkbenchView([
      record({ id: "run_old", createdAt: "2026-06-09T00:00:00.000Z", replay: { supported: false, freshExecution: true } }),
      record({ id: "run_new", createdAt: "2026-06-11T00:00:00.000Z", status: "failed", nextAction: "Inspect failed evidence." }),
    ]);

    expect(view.selected?.summary.id).toBe("run_new");
    expect(view.stats).toMatchObject({
      total: 2,
      needsAction: 1,
      replayable: 1,
      failedOrDegraded: 1,
    });
  });

  it("renders run list, audit panels, and redacted raw inspector content", () => {
    const view = buildRunWorkbenchView([record()]);
    const html = renderRunWorkbench(view);

    expect(html).toContain("Run list");
    expect(html).toContain("Route and skills");
    expect(html).toContain("Evidence");
    expect(html).toContain("Risk and approvals");
    expect(html).toContain("Tools and budget");
    expect(html).toContain("Replay and artifacts");
    expect(html).toContain("Raw redacted record");
    expect(html).toContain("real-world:file-write");
    expect(html).toContain("workspace:hello.txt");
    expect(html).not.toContain("sk-secret123456");
    expect(html).toContain("[REDACTED]");
  });
});
