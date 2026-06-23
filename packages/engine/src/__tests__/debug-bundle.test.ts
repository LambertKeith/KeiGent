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
  record.automation = {
    trigger: "manual",
    scope: "last 20 runs",
    noOpReason: "No triage candidates found.",
    doesNotProve: ["No hidden failures outside token=sk-scope-secret-123456."],
  };
  record.proofBoundary = {
    proven: ["tool failure captured"],
    notProven: ["No hidden failures outside token=sk-proof-secret-123456."],
    assumptions: ["The local run store was complete."],
    evidenceGaps: ["No model latency trace was recorded."],
  };
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
    const evalCasePath = join(artifactDir, "eval-case.json");
    await writeFile(workflowPath, JSON.stringify({ finalResponse: "Bearer workflow-secret-token" }), "utf8");
    await writeFile(evalCasePath, JSON.stringify({ id: "case-secret", apiKey: "sk-eval-case-secret-123456" }), "utf8");
    const bundleDir = join(dir, "bundle");
    const record = failedRecord(workflowPath);
    record.artifacts.push({ kind: "eval_case", path: evalCasePath });

    const result = await exportRunDebugBundle(record, {
      bundleDir,
      config: { apiKey: "sk-config-secret-123456", modelId: "test-model" },
    });

    expect(result).toMatchObject({
      runId: "run_failed",
      bundleDir,
      files: expect.arrayContaining([
        expect.objectContaining({ relativePath: "record.json" }),
        expect.objectContaining({ relativePath: "workflow-trajectory.json" }),
        expect.objectContaining({ relativePath: "eval-case.json" }),
        expect.objectContaining({ relativePath: "redacted-config.json" }),
        expect.objectContaining({ relativePath: "redaction-summary.json" }),
        expect.objectContaining({ relativePath: "tool-summary.json" }),
        expect.objectContaining({ relativePath: "observability-summary.json" }),
        expect.objectContaining({ relativePath: "triage-summary.json" }),
        expect.objectContaining({ relativePath: "failure-summary.md" }),
      ]),
      missingArtifacts: [],
    });
    const serializedRecord = await readFile(join(bundleDir, "record.json"), "utf8");
    const workflow = await readFile(join(bundleDir, "workflow-trajectory.json"), "utf8");
    const evalCase = await readFile(join(bundleDir, "eval-case.json"), "utf8");
    const config = JSON.parse(await readFile(join(bundleDir, "redacted-config.json"), "utf8"));
    const redactionSummary = JSON.parse(await readFile(join(bundleDir, "redaction-summary.json"), "utf8"));
    const observability = JSON.parse(await readFile(join(bundleDir, "observability-summary.json"), "utf8"));
    const triage = JSON.parse(await readFile(join(bundleDir, "triage-summary.json"), "utf8"));
    const failureSummary = await readFile(join(bundleDir, "failure-summary.md"), "utf8");
    expect(serializedRecord).not.toContain("sk-final-secret-123456");
    expect(serializedRecord).not.toContain("sk-blocking-secret-123456");
    expect(workflow).not.toContain("workflow-secret-token");
    expect(evalCase).not.toContain("sk-eval-case-secret-123456");
    expect(config).toMatchObject({ apiKey: "[REDACTED:...3456]", modelId: "test-model" });
    expect(redactionSummary).toMatchObject({
      schemaVersion: 1,
      runId: "run_failed",
      applied: true,
      rawPayloadStored: false,
      rules: expect.arrayContaining(["secret_like_keys", "secret_like_text", "user_home_path_segments"]),
      scopes: expect.arrayContaining([
        expect.objectContaining({ name: "record", redacted: true }),
        expect.objectContaining({ name: "config", redacted: true }),
        expect.objectContaining({ name: "generated_summaries", redacted: true }),
        expect.objectContaining({ name: "artifact_copies", redacted: true }),
      ]),
      filesRedacted: expect.arrayContaining(["record.json", "redacted-config.json", "workflow-trajectory.json", "eval-case.json"]),
      missingArtifacts: [],
      doesNotProve: expect.arrayContaining(["Pattern-based redaction does not prove every possible PII value was detected."]),
    });
    expect(JSON.stringify(redactionSummary)).not.toContain("sk-config-secret-123456");
    expect(JSON.stringify(redactionSummary)).not.toContain("sk-eval-case-secret-123456");
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
    expect(triage).toMatchObject({
      runId: "run_failed",
      status: "failed",
      evidenceStatus: "failed",
      nextAction: "Inspect the failing tool output.",
      blockingEvidence: ["token=[REDACTED]"],
      proofBoundary: {
        proven: ["tool failure captured"],
        notProven: ["No hidden failures outside token=[REDACTED]"],
        assumptions: ["The local run store was complete."],
        evidenceGaps: ["No model latency trace was recorded."],
      },
      automation: {
        scope: "last 20 runs",
        doesNotProve: ["No hidden failures outside token=[REDACTED]"],
      },
    });
    expect(failureSummary).toContain("tool_unavailable");
    expect(failureSummary).toContain("Inspect the failing tool output.");
  });

  it("exports timeout and abort source signals without fabricating latency", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keigent-debug-bundle-timeout-"));
    const artifactDir = join(dir, "artifacts");
    await mkdir(artifactDir, { recursive: true });
    const workflowPath = join(artifactDir, "workflow.json");
    await writeFile(workflowPath, JSON.stringify({ finalResponse: "[错误] parent timeout after child aborted" }), "utf8");
    const bundleDir = join(dir, "bundle");
    const record = failedRecord(workflowPath);
    record.id = "run_timeout_abort";
    record.status = "cancelled";
    record.execution = {
      ...record.execution,
      exitReason: "error",
      finalResponseSummary: "[错误] aborted after parent timeout",
    };
    record.workflow = {
      ...record.workflow!,
      exitReason: "timeout",
      budgetExceeded: true,
      budgetUsage: {
        ...record.workflow!.budgetUsage,
        durationMs: 120001,
      },
    };
    record.failures = [{
      code: "timeout",
      layer: "budget",
      message: "workflow parent timed out after aborting the child run",
      nextAction: "Inspect timeout budget and child trajectory.",
    }];

    await exportRunDebugBundle(record, { bundleDir });

    const observability = JSON.parse(await readFile(join(bundleDir, "observability-summary.json"), "utf8"));
    expect(observability).toMatchObject({
      runId: "run_timeout_abort",
      status: "cancelled",
      budget: {
        exceeded: true,
        usage: expect.objectContaining({ durationMs: 120001, recoveryAttempts: 2 }),
        limits: expect.objectContaining({ timeoutMs: 120000 }),
      },
      recovery: { attempts: 2, limit: 2 },
      timeoutAbort: {
        timedOut: true,
        aborted: true,
        timeoutSources: expect.arrayContaining(["workflow.exitReason", "failures.timeout"]),
        abortSources: ["execution.finalResponseSummary"],
      },
      latency: {
        toolLatency: { status: "not_recorded" },
        modelLatency: { status: "not_recorded" },
      },
      failureTaxonomy: [{ code: "timeout", layer: "budget", count: 1 }],
    });
  });
});
