import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildNoOpRunRecord,
  buildRunRecordFromWorkflowResult,
  readRunRecord,
  readRunStore,
  saveRunRecord,
  summarizeRunRecord,
  type LoopResult,
  type RunRecord,
  type WorkflowResult,
} from "../lib.js";

function loopResult(overrides: Partial<LoopResult> = {}): LoopResult {
  const task = {
    goal: "Create hello.txt",
    profile: "auto",
    successDef: {
      goal: "hello file exists",
      assertions: [{ kind: "fileExists" as const, path: "hello.txt" }],
    },
  };
  return {
    exitReason: "success",
    finalResponse: "created",
    iterations: 2,
    checkpointsPassed: 1,
    totalToolCalls: 1,
    trajectory: {
      task,
      profile: "convergent-exec",
      exitReason: "success",
      steps: [
        {
          iteration: 0,
          kind: "skill_match",
          skillMatches: [{
            name: "file-write",
            status: "verified",
            score: 12,
            signals: ["tag:file"],
            matched: true,
            injected: true,
            evalCoverage: ["file-write-success"],
          }],
        },
        {
          iteration: 1,
          kind: "tool_call",
          toolName: "file_write",
          toolArgs: { path: "hello.txt" },
          toolResult: "created",
          toolSucceeded: true,
        },
        {
          iteration: 1,
          kind: "approval",
          approval: {
            approved: true,
            decidedAt: "2026-06-10T00:00:01.000Z",
            request: {
              toolName: "file_write",
              args: { path: "hello.txt" },
              permission: "write",
              riskLevel: "R3",
              sideEffect: "local",
              reversible: true,
              action: "write file",
              targetResource: "workspace:hello.txt",
              evidenceRequired: ["fileExists"],
              exposesSecrets: false,
            },
          },
        },
        {
          iteration: 2,
          kind: "checkpoint",
          checkpointDesc: "hello exists",
          snapshot: { raw: {} },
          verdictPassed: true,
          verdictEvidence: "file exists",
        },
      ],
      finalResponse: "created",
      durationMs: 10,
      skillsUsed: ["file-write"],
    },
    ...overrides,
  };
}

function workflowResult(exitReason: WorkflowResult["exitReason"] = "success"): WorkflowResult {
  const child = loopResult();
  return {
    workflowId: "wf-run-record",
    mode: "verified-loop",
    exitReason,
    finalResponse: child.finalResponse,
    childRuns: [{ id: "wf-run-record:worker-1", role: "worker", result: child, trajectory: child.trajectory }],
    evidence: [
      { kind: "checkpoint", passed: true, message: "file exists", sourceChildRunId: "wf-run-record:worker-1" },
    ],
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
    durationMs: 20,
    trajectory: {
      schemaVersion: 1,
      workflowId: "wf-run-record",
      mode: "verified-loop",
      goal: "Create hello.txt",
      rootTask: child.trajectory.task,
      startedAt: "2026-06-10T00:00:00.000Z",
      durationMs: 20,
      exitReason,
      finalResponse: child.finalResponse,
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
      evidence: [
        { kind: "checkpoint", passed: true, message: "file exists", sourceChildRunId: "wf-run-record:worker-1" },
      ],
      events: [
        {
          kind: "child_event",
          workflowId: "wf-run-record",
          childRunId: "wf-run-record:worker-1",
          event: {
            kind: "profile_selected",
            profile: "convergent-exec",
            via: "rule",
            ruleId: "skill_match",
            rationale: "matched file-write",
            signals: ["skill:file-write"],
          },
        },
      ],
      childRuns: [{ id: "wf-run-record:worker-1", role: "worker", result: child, trajectory: child.trajectory }],
    },
  };
}

describe("RunRecord", () => {
  it("maps workflow result into an evidence-first run record", () => {
    const record = buildRunRecordFromWorkflowResult(workflowResult(), {
      id: "run_test",
      createdAt: "2026-06-10T00:00:00.000Z",
      taskSource: "cli",
      workflowTrajectoryPath: "/tmp/workflow.json",
    });

    expect(record).toMatchObject({
      schemaVersion: 1,
      id: "run_test",
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
        rationale: "matched file-write",
        matchedSkillIds: ["file-write"],
      },
      workflow: {
        budget: {
          maxIterationsPerRun: 3,
          maxToolCallsPerRun: 5,
          maxTokenEstimatePerRun: 8_000,
          maxRecoveryAttemptsPerRun: 2,
        },
        budgetUsage: {
          iterations: 2,
          toolCalls: 1,
          tokenEstimate: 120,
          recoveryAttempts: 0,
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
        exitReason: "success",
      },
      evidence: {
        status: "passed",
        total: 1,
        passed: 1,
        failed: 0,
      },
      risk: {
        highestRiskLevel: "R3",
        approvalRequired: true,
        sideEffectsAttempted: 1,
        sideEffectsSucceeded: 1,
      },
      replay: {
        supported: true,
        freshExecution: true,
        trajectoryPath: "/tmp/workflow.json",
      },
      proofBoundary: {
        proven: expect.arrayContaining(["Evidence passed: file exists"]),
        notProven: expect.arrayContaining(["External production health is not proven by this run."]),
        evidenceGaps: [],
      },
    });
    expect(record.approvals).toHaveLength(1);
    expect(record.artifacts).toContainEqual({ kind: "workflow_trajectory", path: "/tmp/workflow.json" });
    expect(record.childRunIds).toEqual(["wf-run-record:worker-1"]);
    expect(record.childRuns).toEqual([expect.objectContaining({
      id: "wf-run-record:worker-1",
      role: "worker",
      profile: "convergent-exec",
      exitReason: "success",
    })]);
    expect(record.skills).toEqual([expect.objectContaining({
      name: "file-write",
      status: "verified",
      reason: "tag:file",
      injected: true,
      evalCoverage: ["file-write-success"],
    })]);
    expect(record.tools).toEqual([expect.objectContaining({
      name: "file_write",
      attempted: true,
      succeeded: true,
      permission: "write",
      riskLevel: "R3",
      sideEffect: "local",
    })]);
  });

  it("does not treat empty evidence as verified success", () => {
    const withoutEvidence = workflowResult("success");
    withoutEvidence.evidence = [];
    withoutEvidence.trajectory.evidence = [];
    withoutEvidence.childRuns[0]!.result.checkpointsPassed = 0;
    withoutEvidence.childRuns[0]!.result.trajectory.steps = [];

    const record = buildRunRecordFromWorkflowResult(withoutEvidence, { id: "run_no_evidence" });

    expect(record.status).toBe("succeeded");
    expect(record.evidence).toMatchObject({ status: "not_checked", total: 0, passed: 0, failed: 0 });
    expect(record.proofBoundary.evidenceGaps).toContain("No verification evidence was checked.");
  });

  it("marks timeout and replay records without overriding fresh execution semantics", () => {
    const record = buildRunRecordFromWorkflowResult(workflowResult("timeout"), {
      id: "run_timeout",
      replay: { freshExecution: false, latestReplayReportId: "rw-l2-001" },
    });

    expect(record.status).toBe("cancelled");
    expect(record.replay).toMatchObject({ supported: true, freshExecution: false, latestReplayReportId: "rw-l2-001" });
    expect(record.nextAction).toContain("timeout");
  });

  it("creates auditable no-op automation records without pretending system health", () => {
    const record = buildNoOpRunRecord({
      id: "run_noop",
      createdAt: "2026-06-10T00:00:00.000Z",
      goal: "Triage recent failed runs",
      trigger: "manual",
      scope: "last 20 runs",
      noOpReason: "No triage candidates found.",
      doesNotProve: ["No hidden failures outside this scope."],
    });

    expect(record).toMatchObject({
      id: "run_noop",
      status: "no_op",
      task: { source: "automation", goal: "Triage recent failed runs" },
      evidence: { status: "not_checked", total: 0 },
      automation: {
        trigger: "manual",
        scope: "last 20 runs",
        noOpReason: "No triage candidates found.",
        doesNotProve: ["No hidden failures outside this scope."],
      },
      replay: { supported: false, freshExecution: true },
    });
    expect(summarizeRunRecord(record)).toContain("Status: no_op");
  });

  it("persists record.json under the run id directory and renders a CLI summary", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keigent-runs-"));
    const record = buildRunRecordFromWorkflowResult(workflowResult(), { id: "run_test" });

    const path = await saveRunRecord(record, { runsDir: dir });
    const saved = JSON.parse(await readFile(path, "utf8"));
    const summary = summarizeRunRecord(record);

    expect(path).toBe(join(dir, "run_test", "record.json"));
    expect(saved.id).toBe("run_test");
    expect(summary).toContain("Run: run_test");
    expect(summary).toContain("Status: succeeded");
    expect(summary).toContain("Evidence: 1 passed / 0 failed");
    expect(summary).toContain("Budget: 2/3 iterations, 1/5 tools, 120/8000 estimated tokens, 0/2 recoveries");
    expect(summary).toContain("Risk: R3");
  });

  it("preserves provider usage in run records and summaries", () => {
    const result = workflowResult();
    result.budgetUsage.providerUsage = {
      inputTokens: 100,
      outputTokens: 25,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: 140,
      costUsd: 0.075,
      costStatus: "priced",
    };
    result.trajectory.budgetUsage.providerUsage = result.budgetUsage.providerUsage;
    result.childRuns[0]!.result.providerUsage = result.budgetUsage.providerUsage;
    result.childRuns[0]!.trajectory!.providerUsage = result.budgetUsage.providerUsage;

    const record = buildRunRecordFromWorkflowResult(result, { id: "run_usage" });

    expect(record.workflow?.budgetUsage.providerUsage).toEqual({
      inputTokens: 100,
      outputTokens: 25,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: 140,
      costUsd: 0.075,
      costStatus: "priced",
    });
    expect(summarizeRunRecord(record)).toContain("provider tokens 140");
    expect(summarizeRunRecord(record)).toContain("provider cost $0.075000");
  });

  it("reads run store records newest first while tolerating malformed files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keigent-run-store-"));
    const older = buildRunRecordFromWorkflowResult(workflowResult(), {
      id: "run_older",
      createdAt: "2026-06-09T00:00:00.000Z",
    });
    const newer = buildRunRecordFromWorkflowResult(workflowResult(), {
      id: "run_newer",
      createdAt: "2026-06-10T00:00:00.000Z",
    });
    await saveRunRecord(older, { runsDir: dir });
    await saveRunRecord(newer, { runsDir: dir });
    await import("node:fs/promises").then(({ mkdir, writeFile }) =>
      mkdir(join(dir, "bad"), { recursive: true }).then(() => writeFile(join(dir, "bad", "record.json"), "{bad json", "utf8")));

    const store = await readRunStore({ runsDir: dir });

    expect(store.records.map((record: RunRecord) => record.id)).toEqual(["run_newer", "run_older"]);
    expect(store.errors).toEqual([expect.objectContaining({ runId: "bad", code: "invalid_json" })]);
    await expect(readRunRecord(join(dir, "run_newer", "record.json"))).resolves.toMatchObject({ id: "run_newer" });
  });

  it("normalizes legacy records without upgrading unknown status or leaking unknown secret fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keigent-legacy-run-"));
    const recordPath = join(dir, "legacy", "record.json");
    await mkdir(join(dir, "legacy"), { recursive: true });
    await writeFile(recordPath, JSON.stringify({
      id: "legacy",
      createdAt: "2026-06-10T00:00:00.000Z",
      status: "mystery",
      task: { goal: "Legacy run" },
      evidence: {},
      replay: { freshExecution: false },
      apiKey: "sk-legacy-secret-123456",
    }), "utf8");

    const record = await readRunRecord(recordPath);

    expect(record).toMatchObject({
      id: "legacy",
      status: "unknown",
      task: { goal: "Legacy run", source: "unknown" },
      evidence: { status: "not_checked", total: 0, passed: 0, failed: 0 },
      replay: { supported: false, freshExecution: false },
      redaction: { applied: true, rawPayloadStored: false },
    });
    expect(JSON.stringify(record)).not.toContain("sk-legacy-secret-123456");
  });
});
