import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runEvalCommand, runReplayCommand } from "../eval-commands.js";
import { readRunStore, type Trajectory } from "@keigent/engine";

function capture(): { lines: string[]; stdout: (line: string) => void } {
  const lines: string[] = [];
  return { lines, stdout: (line) => lines.push(line) };
}

async function writeTrajectory(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "keigent-replay-command-"));
  const path = join(dir, "trajectory.json");
  const trajectory: Trajectory = {
    task: { goal: "你好", profile: "auto" },
    profile: "conversational",
    exitReason: "success",
    steps: [{ iteration: 1, kind: "text_output", text: "你好，我在。" }],
    finalResponse: "你好，我在。",
    durationMs: 1,
    skillsUsed: [],
  };
  await writeFile(path, JSON.stringify(trajectory), "utf8");
  return path;
}

async function writeOperatorAcceptanceSignoff(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "keigent-operator-acceptance-"));
  const path = join(dir, "signoff.json");
  const caseIds = [
    ["repo-acceptance", "accepted"],
    ["failure-triage", "deferred"],
    ["skill-promotion-review", "deferred"],
    ["workbench-review", "accepted"],
    ["governed-execution", "rejected"],
    ["automation-no-op-review", "deferred"],
    ["connector-readonly-review", "accepted"],
  ];
  await writeFile(path, JSON.stringify({
    datasetId: "operator-scenario-v1",
    reviewerName: "Casey Reviewer",
    reviewedAt: "2026-06-10T00:00:00.000Z",
    finalDecision: "accepted",
    cases: caseIds.map(([caseId, humanDecision]) => ({
      caseId,
      humanDecision,
      evidenceInspected: true,
      falseConfidenceRisksAccepted: true,
      notes: `Reviewed ${caseId}`,
    })),
  }), "utf8");
  return path;
}

describe("eval and replay commands", () => {
  it("runs smoke eval through the engine eval harness", async () => {
    const output = capture();

    await runEvalCommand(["smoke", "--compact"], { stdout: output.stdout });
    const report = JSON.parse(output.lines[0]!);

    expect(report.total).toBeGreaterThan(0);
    expect(report.failed).toBe(0);
    expect(report.executionModes.smoke).toBe(report.total);
  });

  it("accepts --json for smoke eval output", async () => {
    const output = capture();

    await runEvalCommand(["smoke", "--json"], { stdout: output.stdout });
    const report = JSON.parse(output.lines[0]!);

    expect(report.total).toBeGreaterThan(0);
    expect(report.failed).toBe(0);
    expect(output.lines[0]).toContain("\n");
  });

  it("runs orchestrator eval through the engine eval harness", async () => {
    const output = capture();

    await runEvalCommand(["orchestrator"], { stdout: output.stdout });
    const report = JSON.parse(output.lines[0]!);

    expect(report.total).toBeGreaterThan(0);
    expect(report.failed).toBe(0);
    expect(report.profileAccuracy).toBe(1);
  });

  it("supports compact JSON for orchestrator eval output", async () => {
    const output = capture();

    await runEvalCommand(["orchestrator", "--compact"], { stdout: output.stdout });
    const report = JSON.parse(output.lines[0]!);

    expect(report.failed).toBe(0);
    expect(output.lines[0]).not.toContain("\n");
  });

  it("runs real-world L2 eval through the fixture baseline", async () => {
    const output = capture();

    await runEvalCommand(["real-world", "--compact"], { stdout: output.stdout });
    const report = JSON.parse(output.lines[0]!);

    expect(report).toMatchObject({
      level: "L2",
      datasetId: "local-real-task-v1",
      totals: { total: 19, failed: 0 },
      falseSuccessCount: 0,
    });
    expect(report.cases.map((testCase: { id: string }) => testCase.id)).toContain("approval-denied");
    expect(report.cases.map((testCase: { id: string }) => testCase.id)).toContain("no-op-automation");
    expect(report.cases.map((testCase: { id: string }) => testCase.id)).toContain("budget-exceeded");
    expect(report.cases.find((testCase: { id: string }) => testCase.id === "replay-report")).toMatchObject({
      runId: "run_replay-report",
      runRecord: {
        id: "run_replay-report",
        replay: { freshExecution: false },
      },
    });
  });

  it("runs operator L3 eval through the fixture reviewer", async () => {
    const output = capture();

    await runEvalCommand(["operator", "--compact"], { stdout: output.stdout });
    const report = JSON.parse(output.lines[0]!);

    expect(report).toMatchObject({
      level: "L3",
      datasetId: "operator-scenario-v1",
      totals: { total: 7, failed: 0 },
      decisions: { accepted: 3, deferred: 3, rejected: 1 },
      healthClaim: "Manual-review scenario fixture, not autonomous product certification",
    });
    expect(report.cases.map((testCase: { id: string }) => testCase.id)).toContain("failure-triage");
  });

  it("prints a human operator acceptance packet for L3 eval when requested", async () => {
    const output = capture();

    await runEvalCommand(["operator", "--packet"], { stdout: output.stdout });

    expect(output.lines[0]).toContain("# L3 Operator Acceptance Packet");
    expect(output.lines[0]).toContain("Fixture results are not human acceptance");
    expect(output.lines[0]).toContain("Proof boundary");
    expect(output.lines[0]).toContain("Override reason");
    expect(output.lines[0]).toContain("## Manual Sign-off");
    expect(output.lines[0]).toContain("repo-acceptance");
  });

  it("validates a human operator acceptance sign-off file", async () => {
    const signoffPath = await writeOperatorAcceptanceSignoff();
    const output = capture();

    await runEvalCommand(["operator", "--acceptance", signoffPath, "--compact"], { stdout: output.stdout });
    const record = JSON.parse(output.lines[0]!);

    expect(record).toMatchObject({
      kind: "operator-human-acceptance",
      datasetId: "operator-scenario-v1",
      reviewerName: "Casey Reviewer",
      finalDecision: "accepted",
      accepted: true,
      totals: { total: 7, signedOff: 7, blockingIssues: 0 },
    });
    expect(record.fixtureOnly).toBe(false);
  });

  it("adds a Workbench deep link for real-world eval when --open is requested", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-eval-runs-"));
    const output = capture();

    await runEvalCommand(["real-world", "--compact", "--open"], { stdout: output.stdout, runsDir });
    const report = JSON.parse(output.lines[0]!);
    const store = await readRunStore({ runsDir });

    expect(report).toMatchObject({
      level: "L2",
      datasetId: "local-real-task-v1",
      workbenchHref: "http://127.0.0.1:5173/#eval/real-world/local-real-task-v1",
      persistedRunRecords: {
        total: 19,
        runsDir,
      },
      persistedEvalReport: {
        datasetId: "local-real-task-v1",
        path: join(runsDir, "..", "evals", "real-world", "local-real-task-v1", "latest.json"),
      },
    });
    expect(store.records).toHaveLength(19);
    await expect(readFile(report.persistedEvalReport.path, "utf8").then(JSON.parse)).resolves.toMatchObject({
      datasetId: "local-real-task-v1",
      cases: expect.arrayContaining([
        expect.objectContaining({ runId: "run_replay-report" }),
      ]),
    });
    expect(store.records.map((record) => record.id)).toContain("run_file-summary");
    expect(store.records.map((record) => record.id)).toContain("run_replay-report");
    expect(store.records.find((record) => record.id === "run_replay-report")).toMatchObject({
      replay: { freshExecution: false },
    });
  });

  it("runs replay eval from trajectory mappings", async () => {
    const path = await writeTrajectory();
    const output = capture();

    await runEvalCommand(["replay", "--trajectory", `smoke-conversational-hello=${path}`], {
      stdout: output.stdout,
    });
    const report = JSON.parse(output.lines[0]!);

    expect(report.executionModes.replay).toBe(1);
    expect(report.failed).toBe(0);
  });

  it("accepts --json for replay eval output", async () => {
    const path = await writeTrajectory();
    const output = capture();

    await runEvalCommand(["replay", "--json", "--trajectory", `smoke-conversational-hello=${path}`], {
      stdout: output.stdout,
    });
    const report = JSON.parse(output.lines[0]!);

    expect(report.executionModes.replay).toBe(1);
    expect(report.failed).toBe(0);
  });

  it("summarizes a trajectory replay as not fresh execution", async () => {
    const path = await writeTrajectory();
    const output = capture();

    await runReplayCommand([path], { stdout: output.stdout });
    const summary = JSON.parse(output.lines[0]!);

    expect(summary).toMatchObject({
      replay: true,
      freshExecution: false,
      profile: "conversational",
      exitReason: "success",
      finalResponse: "你好，我在。",
    });
    expect(summary.steps).toBe(1);
  });

  it("supports JSON flags around the replay path", async () => {
    const path = await writeTrajectory();
    const compact = capture();
    const pretty = capture();

    await runReplayCommand(["--compact", path], { stdout: compact.stdout });
    await runReplayCommand(["--json", path], { stdout: pretty.stdout });

    expect(JSON.parse(compact.lines[0]!).replay).toBe(true);
    expect(compact.lines[0]).not.toContain("\n");
    expect(JSON.parse(pretty.lines[0]!).replay).toBe(true);
    expect(pretty.lines[0]).toContain("\n");
  });
});
