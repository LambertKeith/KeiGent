import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildNoOpRunRecord, saveRunRecord, type RunRecord } from "@keigent/engine";
import { parseCliArgs } from "../args.js";
import { runRunsCommand } from "../runs-commands.js";

function capture(): { lines: string[]; stdout: (line: string) => void } {
  const lines: string[] = [];
  return { lines, stdout: (line) => lines.push(line) };
}

function noOpRecord(id: string): RunRecord {
  return buildNoOpRunRecord({
    id,
    goal: "Triage",
    trigger: "manual",
    scope: "last 20 runs",
    noOpReason: "No triage candidates found.",
    doesNotProve: ["No hidden failures outside this scope."],
  });
}

describe("runs commands", () => {
  it("routes runs commands before task handling", () => {
    expect(parseCliArgs(["runs", "list", "--compact"])).toEqual({ kind: "runs", args: ["list", "--compact"] });
  });

  it("lists saved run records as compact JSON", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-runs-"));
    await saveRunRecord(buildNoOpRunRecord({
      id: "run_noop",
      goal: "Triage",
      trigger: "manual",
      scope: "last 20 runs",
      noOpReason: "No triage candidates found.",
      doesNotProve: ["No hidden failures outside this scope."],
    }), { runsDir });
    const output = capture();

    await runRunsCommand(["list", "--compact"], { runsDir, stdout: output.stdout });

    const payload = JSON.parse(output.lines[0]!);
    expect(payload).toMatchObject({
      total: 1,
      runs: [expect.objectContaining({
        id: "run_noop",
        status: "no_op",
        evidenceStatus: "not_checked",
      })],
      errors: [],
    });
    expect(output.lines[0]).not.toContain("\n");
  });

  it("lists legacy records without crashing or leaking unknown secret fields", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-runs-legacy-"));
    await mkdir(join(runsDir, "legacy"), { recursive: true });
    await writeFile(join(runsDir, "legacy", "record.json"), JSON.stringify({
      id: "legacy",
      createdAt: "2026-06-10T00:00:00.000Z",
      status: "mystery",
      task: { goal: "Legacy run" },
      apiKey: "sk-legacy-secret-123456",
    }), "utf8");
    const output = capture();

    await runRunsCommand(["list", "--compact"], { runsDir, stdout: output.stdout });

    const serialized = output.lines[0]!;
    const payload = JSON.parse(serialized);
    expect(payload).toMatchObject({
      total: 1,
      runs: [expect.objectContaining({
        id: "legacy",
        status: "unknown",
        goal: "Legacy run",
        evidenceStatus: "not_checked",
      })],
      errors: [],
      migrationReport: {
        legacyRecords: 1,
        unsupportedRecords: 0,
        warnings: expect.arrayContaining([
          expect.objectContaining({ runId: "legacy", code: "missing_schema_version" }),
          expect.objectContaining({ runId: "legacy", code: "unknown_status" }),
        ]),
      },
    });
    expect(serialized).not.toContain("sk-legacy-secret-123456");
  });

  it("shows a saved run record with next action and automation scope", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-run-show-"));
    await saveRunRecord(noOpRecord("run_noop"), { runsDir });
    const output = capture();

    await runRunsCommand(["show", "run_noop", "--compact"], { runsDir, stdout: output.stdout });

    const payload = JSON.parse(output.lines[0]!);
    expect(payload).toMatchObject({
      id: "run_noop",
      status: "no_op",
      nextAction: "Review automation scope before treating no-op as health.",
      automation: {
        trigger: "manual",
        scope: "last 20 runs",
      },
    });
  });

  it("prints a human-friendly failed run detail with failure code, blocking evidence, and next action", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-run-show-human-"));
    const failed = noOpRecord("run_failed_human");
    failed.status = "failed";
    failed.task.goal = "Create release notes";
    failed.task.resolvedProfile = "convergent-verified";
    failed.task.resolvedWorkflowMode = "verified-loop";
    failed.evidence = {
      status: "failed",
      total: 1,
      passed: 0,
      failed: 1,
      sources: ["assertion"],
      blocking: ["release-notes.md was not created"],
    };
    failed.failures = [{
      code: "verified_failure",
      layer: "verification",
      message: "Required output file is missing.",
      nextAction: "Inspect the missing release-notes.md assertion.",
    }];
    failed.nextAction = "Inspect the missing release-notes.md assertion.";
    await saveRunRecord(failed, { runsDir });
    const output = capture();

    await runRunsCommand(["show", "run_failed_human"], { runsDir, stdout: output.stdout });

    expect(output.lines).toEqual([
      "Run: run_failed_human",
      "Status: failed",
      "Failure: verified_failure",
      "Goal: Create release notes",
      "Profile: convergent-verified",
      "Workflow: verified-loop",
      "Evidence: failed (0/1 passed)",
      "Blocking evidence: release-notes.md was not created",
      "Next action: Inspect the missing release-notes.md assertion.",
      "Automation scope: last 20 runs",
      "Workbench: http://127.0.0.1:5173/#runs/run_failed_human",
    ]);
  });

  it("prints a human-friendly run list with next action hints", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-runs-list-human-"));
    const failed = noOpRecord("run_failed");
    failed.status = "failed";
    failed.evidence = { status: "failed", total: 1, passed: 0, failed: 1, sources: ["assertion"], blocking: ["missing output"] };
    failed.failures = [{
      code: "verified_failure",
      layer: "verification",
      message: "missing output",
      nextAction: "Inspect the failed assertion.",
    }];
    failed.nextAction = "Inspect the failed assertion.";
    const ok = noOpRecord("run_ok");
    ok.status = "succeeded";
    ok.evidence = { status: "passed", total: 1, passed: 1, failed: 0, sources: ["assertion"], blocking: [] };
    await saveRunRecord(ok, { runsDir });
    await saveRunRecord(failed, { runsDir });
    const output = capture();

    await runRunsCommand(["list"], { runsDir, stdout: output.stdout });

    expect(output.lines[0]).toBe("Runs: 2");
    expect(output.lines).toContain("- run_failed | failed | evidence failed | verified_failure | Inspect the failed assertion.");
    expect(output.lines).toContain("- run_ok | succeeded | evidence passed | no action");
  });

  it("redacts sensitive user directory segments from shown run records", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-run-path-redaction-"));
    const record = noOpRecord("run_path_redaction");
    record.replay = {
      supported: true,
      trajectoryPath: "/Users/privateuser/.keigent/runs/run_path/workflow.json",
      freshExecution: false,
    };
    record.artifacts = [{
      kind: "log_excerpt",
      path: "C:\\Users\\privateuser\\workspace\\tool.log",
    }];
    record.nextAction = "Open /home/privateuser/.keigent/runs/run_path/tool.log";
    await saveRunRecord(record, { runsDir });
    const output = capture();

    await runRunsCommand(["show", "run_path_redaction", "--compact"], { runsDir, stdout: output.stdout });

    const serialized = output.lines[0]!;
    expect(serialized).not.toContain("privateuser");
    expect(serialized).toContain("/Users/[REDACTED_USER]/.keigent/runs/run_path/workflow.json");
    expect(serialized).toContain("C:\\\\Users\\\\[REDACTED_USER]\\\\workspace\\\\tool.log");
    expect(serialized).toContain("/home/[REDACTED_USER]/.keigent/runs/run_path/tool.log");
  });

  it("opens a run by printing the Workbench run detail URL", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-run-open-"));
    await saveRunRecord(noOpRecord("run_noop"), { runsDir });
    const output = capture();

    await runRunsCommand(["open", "run_noop", "--compact"], { runsDir, stdout: output.stdout });

    expect(JSON.parse(output.lines[0]!)).toEqual({
      runId: "run_noop",
      runDetailHref: "http://127.0.0.1:5173/#runs/run_noop",
    });
  });

  it("prints a replay handoff for records with saved workflow trajectories", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-run-replay-"));
    const record = noOpRecord("run_replayable");
    record.replay = {
      supported: true,
      trajectoryPath: "/tmp/workflow path.json",
      trajectorySchemaVersion: 1,
      freshExecution: true,
    };
    await saveRunRecord(record, { runsDir });
    const output = capture();

    await runRunsCommand(["replay", "run_replayable", "--compact"], { runsDir, stdout: output.stdout });

    expect(JSON.parse(output.lines[0]!)).toEqual({
      runId: "run_replayable",
      trajectoryPath: "/tmp/workflow path.json",
      command: "keigent replay '/tmp/workflow path.json'",
      freshExecution: false,
      doesNotProve: ["Historical replay does not prove fresh execution."],
      nextAction: "Run the replay command, then inspect the replay report before accepting the result.",
    });
  });

  it("prints a human-friendly replay proof boundary", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-run-replay-human-"));
    const record = noOpRecord("run_replayable");
    record.replay = {
      supported: true,
      trajectoryPath: "/tmp/workflow path.json",
      trajectorySchemaVersion: 1,
      freshExecution: true,
    };
    await saveRunRecord(record, { runsDir });
    const output = capture();

    await runRunsCommand(["replay", "run_replayable"], { runsDir, stdout: output.stdout });

    expect(output.lines).toEqual([
      "Run: run_replayable",
      "Replay command: keigent replay '/tmp/workflow path.json'",
      "Trajectory: /tmp/workflow path.json",
      "Fresh execution: false",
      "Does not prove: Historical replay does not prove fresh execution.",
      "Next action: Run the replay command, then inspect the replay report before accepting the result.",
    ]);
  });

  it("shell-quotes replay trajectories with single quotes", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-run-replay-quoted-"));
    const record = noOpRecord("run_replayable");
    record.replay = {
      supported: true,
      trajectoryPath: "/tmp/operator's workflow.json",
      trajectorySchemaVersion: 1,
      freshExecution: true,
    };
    await saveRunRecord(record, { runsDir });
    const output = capture();

    await runRunsCommand(["replay", "run_replayable", "--compact"], { runsDir, stdout: output.stdout });

    expect(JSON.parse(output.lines[0]!).command).toBe("keigent replay '/tmp/operator'\\''s workflow.json'");
  });

  it("triages non-success records with blocking evidence and next action", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-run-triage-"));
    const failed = noOpRecord("run_failed");
    failed.status = "failed";
    failed.evidence = {
      status: "failed",
      total: 1,
      passed: 0,
      failed: 1,
      sources: ["assertion"],
      blocking: ["missing output"],
    };
    failed.nextAction = "Inspect the failed assertion.";
    const succeeded = noOpRecord("run_ok");
    succeeded.status = "succeeded";
    succeeded.evidence = { status: "passed", total: 1, passed: 1, failed: 0, sources: ["assertion"], blocking: [] };
    await saveRunRecord(succeeded, { runsDir });
    await saveRunRecord(failed, { runsDir });
    const output = capture();

    await runRunsCommand(["triage", "--compact"], { runsDir, stdout: output.stdout });

    const payload = JSON.parse(output.lines[0]!);
    expect(payload).toMatchObject({
      total: 1,
      runs: [{
        id: "run_failed",
        status: "failed",
        blocking: ["missing output"],
        nextAction: "Inspect the failed assertion.",
      }],
    });
  });

  it("prints human-friendly triage candidates with reason, failure code, and next action", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-run-triage-human-"));
    const failed = noOpRecord("run_failed");
    failed.status = "failed";
    failed.evidence = {
      status: "failed",
      total: 1,
      passed: 0,
      failed: 1,
      sources: ["assertion"],
      blocking: ["missing output"],
    };
    failed.failures = [{
      code: "verified_failure",
      layer: "verification",
      message: "missing output",
      nextAction: "Inspect the failed assertion.",
    }];
    failed.nextAction = "Inspect the failed assertion.";
    await saveRunRecord(failed, { runsDir });
    const output = capture();

    await runRunsCommand(["triage"], { runsDir, stdout: output.stdout });

    expect(output.lines).toEqual([
      "Triage candidates: 1",
      "- run_failed | blocking_failure | failed | verified_failure",
      "  Blocking: missing output",
      "  Next action: Inspect the failed assertion.",
    ]);
  });

  it("triages schema warnings and missing evidence instead of only non-success status", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-run-triage-schema-"));
    const missingEvidence = noOpRecord("run_missing_evidence");
    missingEvidence.status = "succeeded";
    missingEvidence.evidence = { status: "not_checked", total: 0, passed: 0, failed: 0, sources: [], blocking: [] };
    delete missingEvidence.nextAction;
    await saveRunRecord(missingEvidence, { runsDir });
    const unknownStatus = noOpRecord("run_unknown_status");
    unknownStatus.status = "unknown";
    unknownStatus.evidence = { status: "not_checked", total: 0, passed: 0, failed: 0, sources: [], blocking: [] };
    delete unknownStatus.nextAction;
    await saveRunRecord(unknownStatus, { runsDir });
    await mkdir(join(runsDir, "legacy-success"), { recursive: true });
    await writeFile(join(runsDir, "legacy-success", "record.json"), JSON.stringify({
      id: "legacy-success",
      createdAt: "2026-06-10T00:00:00.000Z",
      updatedAt: "2026-06-10T00:00:00.000Z",
      status: "succeeded",
      task: { goal: "Legacy successful run", source: "cli" },
      route: { source: "rule", matchedSkillIds: [] },
      execution: {
        iterations: 1,
        totalToolCalls: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        checkpointCount: 1,
        passedCheckpoints: 1,
        durationMs: 10,
        exitReason: "completed",
        finalResponseSummary: "ok",
        eventCounts: {},
      },
      evidence: { status: "passed", total: 1, passed: 1, failed: 0, sources: ["assertion"], blocking: [] },
      risk: {
        highestRiskLevel: "R0",
        permissionClassesUsed: [],
        sideEffectsAttempted: 0,
        sideEffectsSucceeded: 0,
        externalSideEffects: 0,
        irreversibleActions: 0,
        approvalRequired: false,
      },
      approvals: [],
      failures: [],
      artifacts: [],
      autonomy: { outcome: "completed", repairAttempts: [], escalations: [], budgetExhausted: false },
      proofBoundary: { proven: ["legacy assertion passed"], notProven: [], assumptions: [], evidenceGaps: [] },
      replay: { supported: false, freshExecution: true },
      redaction: { applied: true, rawPayloadStored: false },
    }), "utf8");
    const output = capture();

    await runRunsCommand(["triage", "--compact"], { runsDir, stdout: output.stdout });

    const payload = JSON.parse(output.lines[0]!);
    expect(payload).toMatchObject({
      total: 3,
      runs: expect.arrayContaining([
        expect.objectContaining({
          id: "run_missing_evidence",
          status: "succeeded",
          reason: "missing_evidence",
          nextAction: "Collect evidence before treating this run as successful.",
        }),
        expect.objectContaining({
          id: "run_unknown_status",
          status: "unknown",
          reason: "stale_schema",
          nextAction: "Review run record schema before trusting this result.",
        }),
        expect.objectContaining({
          id: "legacy-success",
          status: "succeeded",
          reason: "stale_schema",
          blocking: ["missing_schema_version: record schemaVersion is missing; normalized as schemaVersion 1"],
          nextAction: "Review run record schema before trusting this result.",
        }),
      ]),
    });
  });

  it("exports a redacted debug bundle for a saved run", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-run-debug-"));
    const bundleDir = await mkdtemp(join(tmpdir(), "keigent-cli-debug-bundle-"));
    const workflowPath = join(runsDir, "workflow.json");
    const evalCasePath = join(runsDir, "eval-case.json");
    await writeFile(workflowPath, JSON.stringify({ finalResponse: "api_key=sk-workflow-secret-123456" }), "utf8");
    await writeFile(evalCasePath, JSON.stringify({ id: "case", token: "sk-eval-case-secret-123456" }), "utf8");
    const failed = noOpRecord("run_failed");
    failed.status = "failed";
    failed.execution.finalResponseSummary = "api_key=sk-record-secret-123456";
    failed.artifacts = [
      { kind: "workflow_trajectory", path: workflowPath },
      { kind: "eval_case", path: evalCasePath },
    ];
    await saveRunRecord(failed, { runsDir });
    const output = capture();

    await runRunsCommand(["debug-bundle", "run_failed", "--out", bundleDir, "--compact"], { runsDir, stdout: output.stdout });

    const payload = JSON.parse(output.lines[0]!);
    expect(payload).toMatchObject({
      runId: "run_failed",
      bundleDir,
      files: expect.arrayContaining([
        expect.objectContaining({ relativePath: "record.json" }),
        expect.objectContaining({ relativePath: "workflow-trajectory.json" }),
        expect.objectContaining({ relativePath: "eval-case.json" }),
        expect.objectContaining({ relativePath: "redaction-summary.json" }),
        expect.objectContaining({ relativePath: "tool-summary.json" }),
        expect.objectContaining({ relativePath: "failure-summary.md" }),
      ]),
    });
    expect(await readFile(join(bundleDir, "record.json"), "utf8")).not.toContain("sk-record-secret-123456");
    expect(await readFile(join(bundleDir, "workflow-trajectory.json"), "utf8")).not.toContain("sk-workflow-secret-123456");
    expect(await readFile(join(bundleDir, "eval-case.json"), "utf8")).not.toContain("sk-eval-case-secret-123456");
    const redactionSummary = await readFile(join(bundleDir, "redaction-summary.json"), "utf8");
    expect(redactionSummary).not.toContain("sk-record-secret-123456");
    expect(redactionSummary).not.toContain("sk-workflow-secret-123456");
    expect(redactionSummary).not.toContain("sk-eval-case-secret-123456");
    expect(JSON.parse(redactionSummary)).toMatchObject({
      schemaVersion: 1,
      runId: "run_failed",
      applied: true,
      rawPayloadStored: false,
      filesRedacted: expect.arrayContaining(["record.json", "workflow-trajectory.json", "eval-case.json"]),
    });
  });
});
