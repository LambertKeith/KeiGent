import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildRunRecordFromWorkflowResult,
  saveRunRecord,
  summarizeRunRecord,
  type LoopResult,
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
    budget: { maxChildRuns: 1, maxIterationsPerRun: 3, maxAggregateIterations: 3, maxAggregateToolCalls: 5 },
    budgetUsage: { childRuns: 1, iterations: 2, toolCalls: 1, checkpointsPassed: 1, durationMs: 20 },
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
      budget: { maxChildRuns: 1, maxIterationsPerRun: 3, maxAggregateIterations: 3, maxAggregateToolCalls: 5 },
      budgetUsage: { childRuns: 1, iterations: 2, toolCalls: 1, checkpointsPassed: 1, durationMs: 20 },
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
    });
    expect(record.approvals).toHaveLength(1);
    expect(record.artifacts).toContainEqual({ kind: "workflow_trajectory", path: "/tmp/workflow.json" });
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
  });

  it("marks timeout and replay records without overriding fresh execution semantics", () => {
    const record = buildRunRecordFromWorkflowResult(workflowResult("timeout"), {
      id: "run_timeout",
      replay: { freshExecution: false, latestReplayReportId: "rw-l2-001" },
    });

    expect(record.status).toBe("cancelled");
    expect(record.replay).toMatchObject({ supported: true, freshExecution: false, latestReplayReportId: "rw-l2-001" });
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
    expect(summary).toContain("Risk: R3");
  });
});
