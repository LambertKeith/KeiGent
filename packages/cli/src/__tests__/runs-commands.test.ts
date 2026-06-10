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

  it("prints a replay command for records with saved workflow trajectories", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-run-replay-"));
    const record = noOpRecord("run_replayable");
    record.replay = {
      supported: true,
      trajectoryPath: "/tmp/workflow.json",
      trajectorySchemaVersion: 1,
      freshExecution: true,
    };
    await saveRunRecord(record, { runsDir });
    const output = capture();

    await runRunsCommand(["replay", "run_replayable", "--compact"], { runsDir, stdout: output.stdout });

    expect(JSON.parse(output.lines[0]!)).toEqual({
      runId: "run_replayable",
      trajectoryPath: "/tmp/workflow.json",
      command: "keigent replay /tmp/workflow.json",
      freshExecution: false,
    });
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

  it("exports a redacted debug bundle for a saved run", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-cli-run-debug-"));
    const bundleDir = await mkdtemp(join(tmpdir(), "keigent-cli-debug-bundle-"));
    const workflowPath = join(runsDir, "workflow.json");
    await writeFile(workflowPath, JSON.stringify({ finalResponse: "api_key=sk-workflow-secret-123456" }), "utf8");
    const failed = noOpRecord("run_failed");
    failed.status = "failed";
    failed.execution.finalResponseSummary = "api_key=sk-record-secret-123456";
    failed.artifacts = [{ kind: "workflow_trajectory", path: workflowPath }];
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
        expect.objectContaining({ relativePath: "tool-summary.json" }),
        expect.objectContaining({ relativePath: "failure-summary.md" }),
      ]),
    });
    expect(await readFile(join(bundleDir, "record.json"), "utf8")).not.toContain("sk-record-secret-123456");
    expect(await readFile(join(bundleDir, "workflow-trajectory.json"), "utf8")).not.toContain("sk-workflow-secret-123456");
  });
});
