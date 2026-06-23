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
      budgetUsage: { childRuns: 1, iterations: 2, toolCalls: 1, tokenEstimate: 120, recoveryAttempts: 0, checkpointsPassed: 1, durationMs: 20 },
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
    autonomy: {
      outcome: "completed_without_escalation",
      repairAttempts: [],
      escalations: [],
    },
    redaction: { applied: true, rawPayloadStored: false },
    proofBoundary: {
      proven: ["Evidence passed: file exists"],
      notProven: ["External production health is not proven by this run."],
      assumptions: ["Local fixture evidence is representative for this run only."],
      evidenceGaps: [],
    },
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
      durationMs: 20,
      durationLabel: "20ms",
    });
    expect(view.evidence).toMatchObject({ status: "passed", total: 1, passed: 1 });
    expect(view.risk).toMatchObject({ highestRiskLevel: "R3", approvalRequired: true, sideEffectsSucceeded: 1 });
    expect(view.replay).toMatchObject({ freshExecution: true, label: "Replay available" });
    expect(view.autonomy).toMatchObject({ outcome: "completed_without_escalation", repairAttempts: [], escalations: [] });
    expect(view.approvals).toEqual([expect.objectContaining({ toolName: "file_write", approved: true })]);
    expect(view.route).toMatchObject({ source: "rule", selectedProfile: "convergent-exec", rationale: "matched file skill" });
    expect(view.skills).toEqual([expect.objectContaining({ name: "file-write", injected: true })]);
    expect(view.tools).toEqual([expect.objectContaining({ name: "file_write", succeeded: true })]);
    expect(view.budget).toMatchObject({
      exceeded: false,
      iterations: { used: 2, limit: 3, label: "2/3" },
      toolCalls: { used: 1, limit: 5, label: "1/5" },
      tokenEstimate: { used: 120, limit: 8000, label: "120/8000" },
      recoveryAttempts: { used: 0, limit: 2, label: "0/2" },
      providerUsage: {
        totalTokens: 0,
        tokenLabel: "Not reported",
        costLabel: "Not reported",
        costStatus: "not_reported",
      },
    });
    expect(view.nextAction.label).toBe("No action required");
    expect(view.proofBoundary).toMatchObject({
      proven: ["Evidence passed: file exists"],
      notProven: ["External production health is not proven by this run."],
    });
    expect(view.timelineFacts.map((fact) => fact.label)).toEqual(["Route", "Workflow", "Budget", "Iterations", "Tools", "Checkpoints", "Events"]);
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

  it("derives evidence-backed trust only from fresh checked evidence", () => {
    const view = normalizeRunRecord(runRecord());

    expect(view.trust).toEqual({
      label: "evidence-backed",
      copy: "Evidence-backed completion",
      reason: "Fresh execution with passed evidence and no evidence gaps.",
    });
    expect(view.summary.trust.label).toBe("evidence-backed");
  });

  it("does not let final response text upgrade unchecked evidence to success", () => {
    const view = normalizeRunRecord(runRecord({
      status: "succeeded",
      execution: {
        ...runRecord().execution,
        finalResponseSummary: "Everything succeeded and production is healthy.",
      },
      evidence: {
        status: "not_checked",
        total: 0,
        passed: 0,
        failed: 0,
        sources: [],
        blocking: [],
      },
      proofBoundary: {
        proven: [],
        notProven: ["External production health is not proven by this run."],
        assumptions: [],
        evidenceGaps: ["No verification evidence was checked."],
      },
    }));

    expect(view.trust).toEqual({
      label: "insufficient-evidence",
      copy: "Not enough evidence to mark this run successful",
      reason: "Verification evidence was not checked or was insufficient.",
    });
  });

  it("marks replay reports as replay-only even when their stored status succeeded", () => {
    const view = normalizeRunRecord(runRecord({
      status: "succeeded",
      replay: {
        supported: true,
        trajectoryPath: "/tmp/replay.json",
        latestReplayReportId: "local-real-task-v1:replay-report",
        freshExecution: false,
      },
    }));

    expect(view.trust).toEqual({
      label: "replay-only",
      copy: "Replay result, not a fresh execution",
      reason: "This record is a replay/report view and cannot prove fresh execution.",
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

  it("groups run records into review queues without treating no-op as health", () => {
    const collection = summarizeRunRecords([
      runRecord({ id: "run_succeeded", status: "succeeded" }),
      runRecord({ id: "run_failed", status: "failed", nextAction: "Inspect failed evidence." }),
      runRecord({ id: "run_approval", status: "awaiting_approval" }),
      runRecord({
        id: "run_replay",
        task: { ...runRecord().task, source: "replay" },
        replay: { supported: true, freshExecution: false, latestReplayReportId: "case:replay-report" },
      }),
      runRecord({
        id: "run_no_op",
        status: "no_op",
        nextAction: "Review automation scope before treating no-op as health.",
      }),
    ]);

    expect(collection.queues.needsAction.map((run) => run.id)).toEqual(expect.arrayContaining(["run_failed", "run_approval", "run_no_op"]));
    expect(collection.queues.needsAction).toHaveLength(3);
    expect(collection.queues.failedOrDegraded.map((run) => run.id)).toEqual(["run_failed"]);
    expect(collection.queues.awaitingApproval.map((run) => run.id)).toEqual(["run_approval"]);
    expect(collection.queues.replayOrEval.map((run) => run.id)).toEqual(["run_replay"]);
    expect(collection.queues.recentSucceeded.map((run) => run.id)).toEqual(["run_succeeded"]);
    expect(collection.runs.find((run) => run.id === "run_no_op")?.trust.label).toBe("needs-review");
  });

  it("does not crash on legacy or malformed records and never upgrades unknown status to success", () => {
    const view = normalizeRunRecord({
      schemaVersion: 1,
      id: "legacy",
      createdAt: "2026-06-10T00:00:00.000Z",
      status: "mystery",
      task: { goal: "Legacy run" },
      evidence: {},
      replay: { freshExecution: false },
    });

    expect(view.summary).toMatchObject({
      id: "legacy",
      status: "unknown",
      goal: "Legacy run",
      evidenceStatus: "not_checked",
      evidenceLabel: "No evidence checked",
    });
    expect(view.failures).toEqual([]);
    expect(view.nextAction).toMatchObject({
      required: true,
      label: "Review run record schema before trusting this result.",
    });
    expect(view.proofBoundary).toMatchObject({
      notProven: ["External production health is not proven by this run.", "Historical replay does not prove fresh execution."],
      evidenceGaps: ["No verification evidence was checked."],
    });
  });

  it("surfaces failed run blocking evidence and next action", () => {
    const view = normalizeRunRecord(runRecord({
      status: "failed",
      evidence: {
        status: "failed",
        total: 1,
        passed: 0,
        failed: 1,
        sources: ["assertion"],
        blocking: ["missing file"],
      },
      failures: [{
        code: "verified_failure",
        layer: "verification",
        message: "assertion failed",
        nextAction: "Inspect the missing file assertion.",
      }],
      nextAction: "Inspect the missing file assertion.",
    } as Partial<RunRecord>));

    expect(view.summary.status).toBe("failed");
    expect(view.evidence.blocking).toEqual(["missing file"]);
    expect(view.nextAction).toMatchObject({
      required: true,
      label: "Inspect the missing file assertion.",
    });
  });

  it("normalizes legacy automation records without leaking undefined labels", () => {
    const view = normalizeRunRecord(runRecord({
      status: "no_op",
      automation: {
        classification: "no_op",
        scope: "fixture workspace only",
        doesNotProve: ["No hidden failures outside this scope."],
      } as unknown as RunRecord["automation"],
    }));

    expect(view.automation).toEqual({
      trigger: "manual",
      scope: "fixture workspace only",
      doesNotProve: ["No hidden failures outside this scope."],
      sourceRunIds: [],
    });
  });

  it("surfaces provider usage separately from estimated token budget", () => {
    const view = normalizeRunRecord(runRecord({
      workflow: {
        ...runRecord().workflow!,
        budgetUsage: {
          ...runRecord().workflow!.budgetUsage,
          providerUsage: {
            inputTokens: 100,
            outputTokens: 25,
            cacheReadTokens: 10,
            cacheWriteTokens: 5,
            totalTokens: 140,
            costUsd: 0.075,
            costStatus: "priced",
          },
        },
      },
    }));

    expect(view.budget.providerUsage).toEqual({
      inputTokens: 100,
      outputTokens: 25,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: 140,
      tokenLabel: "140 provider tokens",
      costUsd: 0.075,
      costLabel: "$0.075000",
      costStatus: "priced",
    });
  });
});
