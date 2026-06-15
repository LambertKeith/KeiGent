import { describe, expect, it } from "vitest";
import { buildP0RunAuditFixtureRecords, type RunRecord } from "@keigent/engine";
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
    autonomy: {
      outcome: "completed_without_escalation",
      repairAttempts: [],
      escalations: [],
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
    expect(html).toContain("Proof boundary");
    expect(html).toContain("Autonomy");
    expect(html).toContain("Repair attempts");
    expect(html).toContain("Next action");
    expect(html).toContain("Tools and budget");
    expect(html).toContain("Replay and artifacts");
    expect(html).toContain("Raw redacted record");
    expect(html).toContain("real-world:file-write");
    expect(html).toContain("workspace:hello.txt");
    expect(html).not.toContain("sk-secret123456");
    expect(html).toContain("[REDACTED]");
  });

  it("renders P0-02 run list metadata required for audit triage", () => {
    const view = buildRunWorkbenchView([record({
      execution: {
        ...record().execution,
        durationMs: 1530,
      },
    })]);
    const html = renderRunWorkbench(view);

    expect(html).toContain("convergent-exec");
    expect(html).toContain("verified-loop");
    expect(html).toContain("1.5s");
    expect(html).toContain("Replay available");
  });

  it("renders a P0-02 timeline panel from RunRecord execution facts", () => {
    const view = buildRunWorkbenchView([record()]);
    const html = renderRunWorkbench(view);

    expect(html).toContain("Timeline");
    expect(html).toContain("rule:convergent-exec");
    expect(html).toContain("verified-loop:success");
    expect(html).toContain("1/1");
    expect(html).toContain("2");
  });

  it("renders run store schema compatibility diagnostics when provided by the API", () => {
    const view = buildRunWorkbenchView([record()], undefined, {
      schemaVersion: 1,
      totalRecords: 1,
      normalizedRecords: 1,
      legacyRecords: 1,
      unsupportedRecords: 0,
      warnings: [{
        runId: "legacy",
        path: "/tmp/runs/legacy/record.json",
        code: "missing_schema_version",
        message: "record schemaVersion is missing; normalized as schemaVersion 1",
        field: "schemaVersion",
        normalizedValue: 1,
      }],
    });

    const html = renderRunWorkbench(view);

    expect(html).toContain("Schema compatibility");
    expect(html).toContain("Normalized records");
    expect(html).toContain("1/1");
    expect(html).toContain("Legacy records");
    expect(html).toContain("missing_schema_version");
    expect(html).toContain("record schemaVersion is missing");
  });

  it("renders reviewed-loop rubric and reviewer issues", () => {
    const view = buildRunWorkbenchView([record({
      id: "run_reviewed",
      task: {
        goal: "Draft release notes",
        source: "cli",
        requestedWorkflowMode: "reviewed-loop",
        resolvedWorkflowMode: "reviewed-loop",
      },
      workflow: {
        ...record().workflow!,
        mode: "reviewed-loop",
        childRuns: 2,
      },
      childRuns: [
        { id: "run_reviewed:worker-1", role: "worker", profile: "convergent-exec", exitReason: "success", iterations: 1, toolCalls: 1, checkpointsPassed: 1 },
        { id: "run_reviewed:reviewer-1", role: "reviewer", exitReason: "success", iterations: 1, toolCalls: 0, checkpointsPassed: 0 },
      ],
      review: {
        reviewerRunId: "run_reviewed:reviewer-1",
        rubric: {
          taskGoal: "Draft release notes",
          successCriteria: ["reviewer accepts result"],
          requiredEvidence: ["reviewer checkpoint verdict"],
          forbiddenClaims: ["Do not claim reviewer acceptance without a passed reviewer checkpoint."],
          falseConfidenceRisks: ["Reviewer approval cannot override failed worker evidence."],
          blockingIssueRules: ["Any failed reviewer checkpoint is blocking."],
        },
        issues: [{
          severity: "blocking",
          sourceChildRunId: "run_reviewed:reviewer-1",
          message: "missing source attribution",
          evidenceKind: "checkpoint",
        }],
      },
    })], "run_reviewed");

    const html = renderRunWorkbench(view);

    expect(html).toContain("Review rubric");
    expect(html).toContain("Draft release notes");
    expect(html).toContain("reviewer accepts result");
    expect(html).toContain("Reviewer issues");
    expect(html).toContain("blocking");
    expect(html).toContain("missing source attribution");
    expect(html).toContain("Child run timeline");
    expect(html).toContain("run_reviewed:worker-1");
    expect(html).toContain("worker / convergent-exec");
    expect(html).toContain("run_reviewed:reviewer-1");
    expect(html).toContain("reviewer / reviewer-profile-not-recorded");
  });

  it("renders P1-03 child workspace audit details", () => {
    const view = buildRunWorkbenchView([record({
      id: "run_workspace",
      childRuns: [{
        id: "run_workspace:worker-1",
        role: "worker",
        profile: "convergent-exec",
        exitReason: "success",
        iterations: 1,
        toolCalls: 1,
        checkpointsPassed: 1,
        workspace: {
          workspaceId: "ws_run_workspace_worker_1",
          branchName: "keigent/run-workspace-worker-1",
          workspacePath: "/tmp/keigent/workspaces/ws_run_workspace_worker_1",
          status: "abandoned",
          cleanupMode: "mark_abandoned",
          artifacts: [{
            kind: "generated_file",
            path: "/tmp/keigent/workspaces/ws_run_workspace_worker_1/src/result.txt",
            relativePath: "src/result.txt",
            sizeBytes: 12,
          }],
          conflicts: [{
            relativePath: "src/result.txt",
            workspaceIds: ["ws_run_workspace_worker_1", "ws_run_workspace_worker_2"],
            childRunIds: ["run_workspace:worker-1", "run_workspace:worker-2"],
          }],
        },
      }],
    })], "run_workspace");

    const html = renderRunWorkbench(view);

    expect(html).toContain("Child workspaces");
    expect(html).toContain("ws_run_workspace_worker_1");
    expect(html).toContain("abandoned");
    expect(html).toContain("mark_abandoned");
    expect(html).toContain("src/result.txt");
    expect(html).toContain("ws_run_workspace_worker_2");
  });

  it("redacts sensitive user directory segments from run detail and raw inspector", () => {
    const view = buildRunWorkbenchView([record({
      id: "run_path_redaction",
      artifacts: [{
        kind: "log_excerpt",
        path: "/Users/privateuser/.keigent/runs/run_path/tool.log",
      }],
      replay: {
        supported: true,
        trajectoryPath: "C:\\Users\\privateuser\\workspace\\workflow.json",
        trajectorySchemaVersion: 1,
        freshExecution: false,
      },
      failures: [{
        code: "tool_unavailable",
        layer: "tool",
        message: "Read /home/privateuser/.keigent/runs/run_path/tool.log",
        nextAction: "Open /Users/privateuser/workspace/output.txt",
      }],
    })], "run_path_redaction");

    const html = renderRunWorkbench(view);

    expect(html).not.toContain("privateuser");
    expect(html).toContain("/Users/[REDACTED_USER]/.keigent/runs/run_path/tool.log");
    expect(html).toContain("C:\\Users\\[REDACTED_USER]\\workspace\\workflow.json");
    expect(html).toContain("/home/[REDACTED_USER]/.keigent/runs/run_path/tool.log");
  });

  it("renders the P0 audit fixture set across success, failure, approval, replay, no-op, and child workflow records", () => {
    const records = buildP0RunAuditFixtureRecords();
    const view = buildRunWorkbenchView(records, "run_no-op-automation");
    const html = renderRunWorkbench(view);

    expect(view.stats).toMatchObject({
      total: 7,
      needsAction: 5,
      replayable: 6,
      failedOrDegraded: 4,
    });
    expect(view.collection.runs.map((run) => run.id)).toEqual([
      "run_file-summary",
      "run_failed-assertion",
      "run_approval-denied",
      "run_replay-report",
      "run_insufficient-evidence-success-claim",
      "run_no-op-automation",
      "run_parent-timeout-child-success",
    ]);
    expect(view.selected?.summary.id).toBe("run_no-op-automation");
    expect(view.selected?.nextAction.label).toBe("Review automation scope before treating no-op as health.");
    expect(html).toContain("run_no-op-automation");
    expect(html).toContain("No hidden failures outside this scope.");
    expect(renderRunWorkbench(buildRunWorkbenchView(records, "run_replay-report"))).toContain("Replay report, not fresh execution");
    expect(renderRunWorkbench(buildRunWorkbenchView(records, "run_failed-assertion"))).toContain("missing-output.txt was not found");
    expect(renderRunWorkbench(buildRunWorkbenchView(records, "run_parent-timeout-child-success"))).toContain("parent workflow timed out before accepting child success");
  });
});
