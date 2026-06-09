import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runEvalCommand, runReplayCommand } from "../eval-commands.js";
import type { Trajectory } from "@keigent/engine";

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
