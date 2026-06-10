import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildNoOpRunRecord, exportRunDebugBundle, type RunRecord } from "../lib.js";

function failedRecord(workflowPath: string): RunRecord {
  const record = buildNoOpRunRecord({
    id: "run_failed",
    goal: "Debug failed run",
    trigger: "manual",
    scope: "test",
    noOpReason: "seed",
    doesNotProve: [],
  });
  record.status = "failed";
  record.task.source = "cli";
  record.execution = {
    ...record.execution,
    totalToolCalls: 1,
    failedToolCalls: 1,
    exitReason: "error",
    finalResponseSummary: "failed with api_key=sk-final-secret-123456",
    eventCounts: { workflow_start: 1, child_start: 1, tool_call: 1, recovery: 2, workflow_done: 1 },
  };
  record.workflow = {
    id: "wf_failed",
    mode: "single-loop",
    exitReason: "child_error",
    childRuns: 1,
    budget: {
      maxChildRuns: 1,
      maxIterationsPerRun: 3,
      maxAggregateIterations: 3,
      maxToolCallsPerRun: 2,
      maxAggregateToolCalls: 2,
      maxTokenEstimatePerRun: 8000,
      maxAggregateTokenEstimate: 8000,
      maxRecoveryAttemptsPerRun: 2,
      timeoutMs: 120000,
    },
    budgetUsage: {
      childRuns: 1,
      iterations: 2,
      toolCalls: 1,
      tokenEstimate: 300,
      providerUsage: {
        inputTokens: 100,
        outputTokens: 25,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 140,
        costUsd: 0.075,
        costStatus: "priced",
      },
      recoveryAttempts: 2,
      checkpointsPassed: 0,
      durationMs: 1234,
    },
    budgetExceeded: false,
  };
  record.tools = [{ name: "http_request", attempted: true, succeeded: false, permission: "readonly", riskLevel: "R1", sideEffect: "none" }];
  record.evidence = {
    status: "failed",
    total: 1,
    passed: 0,
    failed: 1,
    sources: ["assertion"],
    blocking: ["token=sk-blocking-secret-123456"],
  };
  record.failures = [{
    code: "tool_unavailable",
    layer: "tool",
    message: "Bearer super-secret-token failed",
    nextAction: "Inspect the failing tool output.",
  }];
  record.nextAction = "Inspect the failing tool output.";
  record.artifacts = [{ kind: "workflow_trajectory", path: workflowPath }];
  return record;
}

describe("debug bundle export", () => {
  it("exports a redacted run bundle with record, artifacts, tool summary, and failure summary", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keigent-debug-bundle-"));
    const artifactDir = join(dir, "artifacts");
    await mkdir(artifactDir, { recursive: true });
    const workflowPath = join(artifactDir, "workflow.json");
    await writeFile(workflowPath, JSON.stringify({ finalResponse: "Bearer workflow-secret-token" }), "utf8");
    const bundleDir = join(dir, "bundle");

    const result = await exportRunDebugBundle(failedRecord(workflowPath), {
      bundleDir,
      config: { apiKey: "sk-config-secret-123456", modelId: "test-model" },
    });

    expect(result).toMatchObject({
      runId: "run_failed",
      bundleDir,
      files: expect.arrayContaining([
        expect.objectContaining({ relativePath: "record.json" }),
        expect.objectContaining({ relativePath: "workflow-trajectory.json" }),
        expect.objectContaining({ relativePath: "redacted-config.json" }),
        expect.objectContaining({ relativePath: "tool-summary.json" }),
        expect.objectContaining({ relativePath: "observability-summary.json" }),
        expect.objectContaining({ relativePath: "failure-summary.md" }),
      ]),
      missingArtifacts: [],
    });
    const serializedRecord = await readFile(join(bundleDir, "record.json"), "utf8");
    const workflow = await readFile(join(bundleDir, "workflow-trajectory.json"), "utf8");
    const config = JSON.parse(await readFile(join(bundleDir, "redacted-config.json"), "utf8"));
    const observability = JSON.parse(await readFile(join(bundleDir, "observability-summary.json"), "utf8"));
    const failureSummary = await readFile(join(bundleDir, "failure-summary.md"), "utf8");
    expect(serializedRecord).not.toContain("sk-final-secret-123456");
    expect(serializedRecord).not.toContain("sk-blocking-secret-123456");
    expect(workflow).not.toContain("workflow-secret-token");
    expect(config).toMatchObject({ apiKey: "[REDACTED:...3456]", modelId: "test-model" });
    expect(observability).toMatchObject({
      runId: "run_failed",
      timeline: [
        { event: "workflow_start", count: 1 },
        { event: "child_start", count: 1 },
        { event: "tool_call", count: 1 },
        { event: "recovery", count: 2 },
        { event: "workflow_done", count: 1 },
      ],
      recovery: { attempts: 2, limit: 2 },
      providerUsage: {
        inputTokens: 100,
        outputTokens: 25,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 140,
        costUsd: 0.075,
        costStatus: "priced",
      },
      timeoutAbort: { timedOut: false, aborted: false },
      latency: {
        totalDurationMs: 1234,
        toolLatency: { status: "not_recorded" },
        modelLatency: { status: "not_recorded" },
      },
      failureTaxonomy: [{ code: "tool_unavailable", layer: "tool", count: 1 }],
    });
    expect(failureSummary).toContain("tool_unavailable");
    expect(failureSummary).toContain("Inspect the failing tool output.");
  });
});
